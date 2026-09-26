import {
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  ForumChannel,
  SlashCommandBuilder,
} from "discord.js";
import { getNonSightingsChannelId } from "../services/config";
import { listLocations, listRetailersInUse } from "../services/locations";

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
      locations
        .slice(0, 25)
        .map((location) => ({
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
  const location = interaction.options.getString("location", true);
  const channelId = getNonSightingsChannelId(guildId);
  if (!channelId) {
    await interaction.reply({
      content:
        "Non-sightings channel isn't configured yet. Ask a mod to run `/config set-non-sightings-channel`.",
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.guild.channels
    .fetch(channelId)
    .catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    await interaction.reply({
      content:
        "The configured non-sightings channel is missing or isn't a forum channel. Ask a mod to check `/config show`.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const title = `${retailer} - ${location}`.slice(0, 100);
  const thread = await (channel as ForumChannel).threads.create({
    name: title,
    message: { content: `Non-sighting reported by ${interaction.user.tag}.` },
  });
  await interaction.editReply(`Created a non-sightings thread: ${thread.url}`);
}
