import { AutocompleteInteraction, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addLocation, getLocation, listLocations, removeLocation } from '../services/locations';
import { getRoleByLabel, listRoles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('sighting-location')
  .setDescription('Manage retailer/location mappings for sightings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a location')
      .addStringOption((o) => o.setName('retailer').setDescription('Retailer, e.g. Target').setRequired(true))
      .addStringOption((o) =>
        o.setName('name').setDescription('Short unique name, e.g. mcknight').setRequired(true)
      )
      .addStringOption((o) =>
        o.setName('label').setDescription('Display name, e.g. "McKnight"').setRequired(true)
      )
      .addStringOption((o) =>
        o.setName('role').setDescription('Which role group this belongs to').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a location')
      .addStringOption((o) => o.setName('retailer').setDescription('Retailer').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('Location name').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List all locations'));

export async function autocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const focused = interaction.options.getFocused(true);
  if (focused.name === 'role') {
    const roles = listRoles(guildId).filter((r) => r.label.toLowerCase().includes(focused.value.toLowerCase()));
    await interaction.respond(roles.slice(0, 25).map((r) => ({ name: r.label, value: r.label })));
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const retailer = interaction.options.getString('retailer', true);
    const name = interaction.options.getString('name', true).toLowerCase();
    const label = interaction.options.getString('label', true);
    const roleLabel = interaction.options.getString('role', true);

    const role = getRoleByLabel(guildId, roleLabel);
    if (!role) {
      await interaction.reply({
        content: `No role group called "${roleLabel}". Add it first with \`/sighting-role add\`.`,
        ephemeral: true,
      });
      return;
    }
    if (getLocation(guildId, retailer, name)) {
      await interaction.reply({ content: `"${retailer} ${name}" already exists.`, ephemeral: true });
      return;
    }
    addLocation(guildId, retailer, name, label, role.id);
    await interaction.reply({ content: `Added **${label}** (${retailer}) → ${roleLabel}.`, ephemeral: true });
    return;
  }

  if (sub === 'remove') {
    const retailer = interaction.options.getString('retailer', true);
    const name = interaction.options.getString('name', true).toLowerCase();
    if (!getLocation(guildId, retailer, name)) {
      await interaction.reply({ content: 'No such location.', ephemeral: true });
      return;
    }
    removeLocation(guildId, retailer, name);
    await interaction.reply({ content: `Removed ${retailer} ${name}.`, ephemeral: true });
    return;
  }

  if (sub === 'list') {
    const locations = listLocations(guildId);
    if (locations.length === 0) {
      await interaction.reply({ content: 'No locations configured yet.', ephemeral: true });
      return;
    }
    const lines = locations.map((l) => `• **${l.retailer}** — ${l.label} (\`${l.name}\`)`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
}
