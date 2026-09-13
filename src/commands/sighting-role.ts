import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addRole, getRoleByLabel, listRoles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('sighting-role')
  .setDescription('Manage the role groups sightings can ping')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a role group')
      .addStringOption((o) =>
        o.setName('label').setDescription('Display name, e.g. "North Hills Area"').setRequired(true)
      )
      .addRoleOption((o) => o.setName('role').setDescription('The Discord role to ping').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List role groups'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const label = interaction.options.getString('label', true);
    const role = interaction.options.getRole('role', true);
    if (getRoleByLabel(guildId, label)) {
      await interaction.reply({ content: `A role group called "${label}" already exists.`, ephemeral: true });
      return;
    }
    addRole(guildId, label, role.id);
    await interaction.reply({ content: `Added role group **${label}** → <@&${role.id}>.`, ephemeral: true });
    return;
  }

  if (sub === 'list') {
    const roles = listRoles(guildId);
    if (roles.length === 0) {
      await interaction.reply({ content: 'No role groups configured yet.', ephemeral: true });
      return;
    }
    const lines = roles.map((r) => `• **${r.label}** → <@&${r.role_id}>`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
}
