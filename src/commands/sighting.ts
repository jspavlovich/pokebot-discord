import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ForumChannel,
  SlashCommandBuilder,
} from 'discord.js';
import { getLocation, listLocations, listRetailers } from '../services/locations';
import { getRoleById } from '../services/roles';
import { getSightingsChannelId } from '../services/config';
import { createThreadRecord, findActiveThread, RETAG_WINDOW_MS, touchPing } from '../services/threads';

export const data = new SlashCommandBuilder()
  .setName('sighting')
  .setDescription('Report a restock sighting')
  .addStringOption((opt) =>
    opt.setName('retailer').setDescription('Retailer, e.g. Target').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt.setName('location').setDescription('Store location').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((opt) => opt.setName('details').setDescription('What did you see?').setRequired(true))
  .addAttachmentOption((opt) => opt.setName('photo').setDescription('Optional photo').setRequired(false));

export async function autocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'retailer') {
    const retailers = listRetailers(guildId).filter((r) =>
      r.toLowerCase().includes(focused.value.toLowerCase())
    );
    await interaction.respond(retailers.slice(0, 25).map((r) => ({ name: r, value: r })));
    return;
  }

  if (focused.name === 'location') {
    const retailer = interaction.options.getString('retailer') ?? undefined;
    const locations = listLocations(guildId, retailer).filter(
      (l) =>
        l.label.toLowerCase().includes(focused.value.toLowerCase()) ||
        l.name.toLowerCase().includes(focused.value.toLowerCase())
    );
    await interaction.respond(locations.slice(0, 25).map((l) => ({ name: l.label, value: l.name })));
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
    return;
  }

  const retailer = interaction.options.getString('retailer', true);
  const locationName = interaction.options.getString('location', true).toLowerCase();
  const details = interaction.options.getString('details', true);
  const photo = interaction.options.getAttachment('photo');

  const location = getLocation(guildId, retailer, locationName);
  if (!location) {
    await interaction.reply({
      content: `I don't have a location called "${locationName}" for ${retailer}. Ask a mod to add it with \`/sighting-location add\`.`,
      ephemeral: true,
    });
    return;
  }

  const channelId = getSightingsChannelId(guildId);
  if (!channelId) {
    await interaction.reply({
      content: "Sightings channel isn't configured yet. Ask a mod to run `/config set-sightings-channel`.",
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    await interaction.reply({
      content: "The configured sightings channel is missing or isn't a forum channel. Ask a mod to check `/config show`.",
      ephemeral: true,
    });
    return;
  }
  const forum = channel as ForumChannel;

  const role = getRoleById(location.role_id);
  const roleMention = role ? `<@&${role.role_id}>` : '';

  await interaction.deferReply({ ephemeral: true });

  const bodyEmbed = new EmbedBuilder()
    .setDescription(details)
    .setFooter({ text: `Reported by ${interaction.user.tag}` })
    .setTimestamp(new Date());
  if (photo) bodyEmbed.setImage(photo.url);

  const existing = findActiveThread(guildId, location.id);

  if (existing) {
    const thread = await forum.threads.fetch(existing.thread_id).catch(() => null);
    if (!thread) {
      await interaction.editReply('Something went wrong finding the existing thread — please try again.');
      return;
    }

    const shouldRePing = Date.now() - existing.last_ping_at >= RETAG_WINDOW_MS;
    await thread.send({
      content: shouldRePing ? `🔔 New activity reported — worth checking again. ${roleMention}`.trim() : undefined,
      embeds: [bodyEmbed],
    });
    if (shouldRePing) touchPing(existing.id);

    await interaction.editReply(`Added your sighting to the existing thread: ${thread.url}`);
    return;
  }

  const clearButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sighting-clear').setLabel('🚫 Mark as cleared').setStyle(ButtonStyle.Secondary)
  );
  const activeTag = forum.availableTags.find((t) => t.name.toLowerCase() === 'active');

  const newThread = await forum.threads.create({
    name: `${retailer} — ${location.label}`,
    appliedTags: activeTag ? [activeTag.id] : [],
    message: {
      content: roleMention || undefined,
      embeds: [bodyEmbed],
      components: [clearButton],
    },
  });

  createThreadRecord(guildId, location.id, newThread.id);
  await interaction.editReply(`Created a new sightings thread: ${newThread.url}`);
}
