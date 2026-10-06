import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  ForumChannel,
  Guild,
  ButtonBuilder,
  ButtonStyle,
  RepliableInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getSightingsChannelId } from "../services/config";
import {
  getLocationByNames,
  listLocations,
  listRetailersInUse,
} from "../services/locations";
import {
  createThreadRecord,
  findTodayThread,
  formatThreadTitle,
  markCleared,
} from "../services/threads";

export const data = new SlashCommandBuilder()
  .setName("non-sightings")
  .setDescription("Start a non-sighting thread for a retailer and location")
  .addStringOption((opt) =>
    opt
      .setName("retailer")
      .setDescription("Retailer")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("location")
      .setDescription("Store location")
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const focused = interaction.options.getFocused(true);

  if (focused.name === "retailer") {
    const retailers = listRetailersInUse(guildId).filter((retailer) =>
      retailer.toLowerCase().includes(focused.value.toLowerCase()),
    );
    await interaction.respond(
      retailers
        .slice(0, 25)
        .map((retailer) => ({ name: retailer, value: retailer })),
    );
    return;
  }

  if (focused.name === "location") {
    const retailer = interaction.options.getString("retailer") ?? undefined;
    const locations = listLocations(guildId, retailer).filter(
      (location) =>
        location.label.toLowerCase().includes(focused.value.toLowerCase()) ||
        location.neighborhood_name
          .toLowerCase()
          .includes(focused.value.toLowerCase()),
    );
    await interaction.respond(
      locations.slice(0, 25).map((location) => ({
        name: location.label,
        value: location.neighborhood_name,
      })),
    );
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ephemeral: true,
    });
    return;
  }

  const retailer = interaction.options.getString("retailer", true);
  const neighborhoodName = interaction.options.getString("location", true);

  await reportNonSighting(interaction, guildId, interaction.guild, retailer, neighborhoodName);
}

/**
 * Shared by the /non-sightings slash command and the button+modal guided-report flow
 * (handlers/reportFlow.ts).
 */
export async function reportNonSighting(
  interaction: RepliableInteraction,
  guildId: string,
  guild: Guild,
  retailer: string,
  neighborhoodName: string,
): Promise<void> {
  const location = getLocationByNames(guildId, retailer, neighborhoodName);
  if (!location) {
    await interaction.reply({
      content:
        "That retailer and location aren't configured. Please select them from the autocomplete options.",
      ephemeral: true,
    });
    return;
  }

  const channelId = getSightingsChannelId(guildId);
  if (!channelId) {
    await interaction.reply({
      content:
        "Sightings channel isn't configured yet. Ask a mod to run `/config set-sightings-channel`.",
      ephemeral: true,
    });
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    await interaction.reply({
      content:
        "The configured sightings channel is missing or isn't a forum channel. Ask a mod to check `/config show`.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const forum = channel as ForumChannel;
  const existing = findTodayThread(guildId, location.id);
  const clearedTag = forum.availableTags.find(
    (tag) => tag.name.toLowerCase() === "cleared",
  );
  const activeTag = forum.availableTags.find(
    (tag) => tag.name.toLowerCase() === "active",
  );
  const expiredTag = forum.availableTags.find(
    (tag) => tag.name.toLowerCase() === "expired",
  );
  const clearButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sighting-clear")
      .setLabel("🚫 Mark as cleared")
      .setStyle(ButtonStyle.Secondary),
  );
  const content = `🚫 No stock reported by ${interaction.user.tag}.`;
  const allowedMentions = { parse: [] as const };

  if (existing) {
    const thread = await forum.threads
      .fetch(existing.thread_id)
      .catch(() => null);
    if (!thread) {
      await interaction.editReply(
        "Something went wrong finding the existing thread. Please try again.",
      );
      return;
    }

    if (thread.archived) await thread.setArchived(false);
    const remainingTags = thread.appliedTags.filter(
      (tagId) =>
        tagId !== activeTag?.id &&
        tagId !== expiredTag?.id &&
        tagId !== clearedTag?.id,
    );
    await thread.setAppliedTags(
      clearedTag ? [...remainingTags, clearedTag.id] : remainingTags,
    );
    await thread.send({ content, allowedMentions });
    markCleared(existing.id);
    await interaction.editReply(
      `Marked the existing location thread as cleared: ${thread.url}`,
    );
    return;
  }

  const createdAt = Date.now();
  const thread = await forum.threads.create({
    name: formatThreadTitle(location.label, createdAt),
    appliedTags: clearedTag ? [clearedTag.id] : [],
    message: { content, components: [clearButton], allowedMentions },
  });
  createThreadRecord(guildId, location.id, thread.id, createdAt, {
    status: "cleared",
    lastPingAt: 0,
  });
  await interaction.editReply(
    `Created a cleared thread for ${location.label}: ${thread.url}`,
  );
}
