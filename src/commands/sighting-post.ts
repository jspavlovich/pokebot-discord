import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sighting-post')
  .setDescription('Post a button-driven sighting report form in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel;
  if (!channel || !channel.isSendable()) {
    await interaction.reply({ content: "I can't post in this channel.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Report Stock')
    .setDescription(
      "See stock at a store, or checked and it's empty? Use the buttons below — no need to remember a slash command."
    )
    .addFields(
      { name: 'Report Sighting', value: 'Found stock? Pick the retailer and location and say what you saw.' },
      { name: 'Report No Stock', value: "Checked and there's nothing? Mark that location cleared." }
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('report-start:sighting')
      .setLabel('📣 Report Sighting')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('report-start:nonsighting')
      .setLabel('🚫 Report No Stock')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [buttons] });
  await interaction.reply({ content: 'Posted.', ephemeral: true });
}
