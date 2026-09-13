import { AutocompleteInteraction, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  addNeighborhood,
  getNeighborhoodByName,
  listNeighborhoods,
  removeNeighborhood,
} from '../services/neighborhoods';
import { getRoleByLabel, getRoleById, listRoles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('sighting-neighborhood')
  .setDescription('Manage the catalog of neighborhoods and which role each pings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a neighborhood')
      .addStringOption((o) => o.setName('name').setDescription('e.g. McKnight').setRequired(true))
      .addStringOption((o) =>
        o.setName('role').setDescription('Role group to ping for this neighborhood').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a neighborhood (and any locations using it)')
      .addStringOption((o) =>
        o.setName('name').setDescription('Neighborhood name').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List all neighborhoods'));

export async function autocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'role' && sub === 'add') {
    const roles = listRoles(guildId).filter((r) => r.label.toLowerCase().includes(focused.value.toLowerCase()));
    await interaction.respond(roles.slice(0, 25).map((r) => ({ name: r.label, value: r.label })));
    return;
  }

  if (focused.name === 'name' && sub === 'remove') {
    const neighborhoods = listNeighborhoods(guildId).filter((n) =>
      n.name.toLowerCase().includes(focused.value.toLowerCase())
    );
    await interaction.respond(neighborhoods.slice(0, 25).map((n) => ({ name: n.name, value: n.name })));
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const name = interaction.options.getString('name', true);
    const roleLabel = interaction.options.getString('role', true);

    const role = getRoleByLabel(guildId, roleLabel);
    if (!role) {
      await interaction.reply({
        content: `No role group called "${roleLabel}". Add it first with \`/sighting-role add\`.`,
        ephemeral: true,
      });
      return;
    }
    if (getNeighborhoodByName(guildId, name)) {
      await interaction.reply({ content: `"${name}" already exists.`, ephemeral: true });
      return;
    }
    addNeighborhood(guildId, name, role.id);
    await interaction.reply({ content: `Added neighborhood **${name}** → ${roleLabel}.`, ephemeral: true });
    return;
  }

  if (sub === 'remove') {
    const name = interaction.options.getString('name', true);
    if (!getNeighborhoodByName(guildId, name)) {
      await interaction.reply({ content: 'No such neighborhood.', ephemeral: true });
      return;
    }
    removeNeighborhood(guildId, name);
    await interaction.reply({ content: `Removed **${name}** (and any locations using it).`, ephemeral: true });
    return;
  }

  if (sub === 'list') {
    const neighborhoods = listNeighborhoods(guildId);
    if (neighborhoods.length === 0) {
      await interaction.reply({ content: 'No neighborhoods configured yet.', ephemeral: true });
      return;
    }
    const lines = neighborhoods.map((n) => {
      const role = getRoleById(n.role_id);
      return `• **${n.name}** → ${role ? role.label : '(unknown role)'}`;
    });
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
}
