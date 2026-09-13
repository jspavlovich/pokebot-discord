import { AutocompleteInteraction, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addRetailer, getRetailerByName, listRetailers, removeRetailer } from '../services/retailers';

export const data = new SlashCommandBuilder()
  .setName('sighting-retailer')
  .setDescription('Manage the catalog of retailers sightings can be reported for')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName('add').setDescription('Add a retailer').addStringOption((o) =>
      o.setName('name').setDescription('e.g. Target').setRequired(true)
    )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a retailer (and any locations using it)')
      .addStringOption((o) => o.setName('name').setDescription('Retailer name').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List all retailers'));

export async function autocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  if (interaction.options.getSubcommand() !== 'remove') return;
  const focused = interaction.options.getFocused(true);
  if (focused.name === 'name') {
    const retailers = listRetailers(guildId).filter((r) => r.name.toLowerCase().includes(focused.value.toLowerCase()));
    await interaction.respond(retailers.slice(0, 25).map((r) => ({ name: r.name, value: r.name })));
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const name = interaction.options.getString('name', true);
    if (getRetailerByName(guildId, name)) {
      await interaction.reply({ content: `"${name}" already exists.`, ephemeral: true });
      return;
    }
    addRetailer(guildId, name);
    await interaction.reply({ content: `Added retailer **${name}**.`, ephemeral: true });
    return;
  }

  if (sub === 'remove') {
    const name = interaction.options.getString('name', true);
    if (!getRetailerByName(guildId, name)) {
      await interaction.reply({ content: 'No such retailer.', ephemeral: true });
      return;
    }
    removeRetailer(guildId, name);
    await interaction.reply({ content: `Removed **${name}** (and any locations using it).`, ephemeral: true });
    return;
  }

  if (sub === 'list') {
    const retailers = listRetailers(guildId);
    if (retailers.length === 0) {
      await interaction.reply({ content: 'No retailers configured yet.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: retailers.map((r) => `• ${r.name}`).join('\n'), ephemeral: true });
  }
}
