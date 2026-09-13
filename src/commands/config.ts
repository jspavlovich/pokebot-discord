import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSightingsChannelId, setSightingsChannelId } from '../services/config';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Bot configuration')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('set-sightings-channel')
      .setDescription('Set the forum channel sightings post into')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('A forum channel')
          .addChannelTypes(ChannelType.GuildForum)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('show').setDescription('Show current configuration'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'set-sightings-channel') {
    const channel = interaction.options.getChannel('channel', true);
    setSightingsChannelId(guildId, channel.id);
    await interaction.reply({ content: `Sightings will now post to <#${channel.id}>.`, ephemeral: true });
    return;
  }

  if (sub === 'show') {
    const channelId = getSightingsChannelId(guildId);
    await interaction.reply({
      content: channelId ? `Sightings channel: <#${channelId}>` : 'Sightings channel not set yet.',
      ephemeral: true,
    });
  }
}
