import { AutocompleteInteraction, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addLocation, getLocationByIds, listLocations, removeLocation } from '../services/locations';
import { getNeighborhoodByName, listNeighborhoods } from '../services/neighborhoods';
import { getRetailerByName, listRetailers } from '../services/retailers';

export const data = new SlashCommandBuilder()
  .setName('sighting-location')
  .setDescription('Combine a retailer and neighborhood into a reportable location')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a location')
      .addStringOption((o) => o.setName('retailer').setDescription('Retailer').setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
        o.setName('neighborhood').setDescription('Neighborhood').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((o) =>
        o
          .setName('label')
          .setDescription('Override display name (default: "Neighborhood - Retailer")')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a location')
      .addStringOption((o) => o.setName('retailer').setDescription('Retailer').setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
        o.setName('neighborhood').setDescription('Neighborhood').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List all locations'));

export async function autocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'retailer') {
    const retailers = listRetailers(guildId).filter((r) => r.name.toLowerCase().includes(focused.value.toLowerCase()));
    await interaction.respond(retailers.slice(0, 25).map((r) => ({ name: r.name, value: r.name })));
    return;
  }

  if (focused.name === 'neighborhood') {
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
    const retailerName = interaction.options.getString('retailer', true);
    const neighborhoodName = interaction.options.getString('neighborhood', true);
    const labelOverride = interaction.options.getString('label');

    const retailer = getRetailerByName(guildId, retailerName);
    if (!retailer) {
      await interaction.reply({
        content: `No retailer called "${retailerName}". Add it first with \`/sighting-retailer add\`.`,
        ephemeral: true,
      });
      return;
    }
    const neighborhood = getNeighborhoodByName(guildId, neighborhoodName);
    if (!neighborhood) {
      await interaction.reply({
        content: `No neighborhood called "${neighborhoodName}". Add it first with \`/sighting-neighborhood add\`.`,
        ephemeral: true,
      });
      return;
    }
    if (getLocationByIds(guildId, retailer.id, neighborhood.id)) {
      await interaction.reply({ content: `"${retailerName} - ${neighborhoodName}" already exists.`, ephemeral: true });
      return;
    }

    const label = labelOverride ?? `${neighborhood.name} - ${retailer.name}`;
    addLocation(guildId, retailer.id, neighborhood.id, label);
    await interaction.reply({ content: `Added location **${label}**.`, ephemeral: true });
    return;
  }

  if (sub === 'remove') {
    const retailerName = interaction.options.getString('retailer', true);
    const neighborhoodName = interaction.options.getString('neighborhood', true);

    const retailer = getRetailerByName(guildId, retailerName);
    const neighborhood = getNeighborhoodByName(guildId, neighborhoodName);
    if (!retailer || !neighborhood || !getLocationByIds(guildId, retailer.id, neighborhood.id)) {
      await interaction.reply({ content: 'No such location.', ephemeral: true });
      return;
    }
    removeLocation(guildId, retailer.id, neighborhood.id);
    await interaction.reply({ content: `Removed ${retailerName} - ${neighborhoodName}.`, ephemeral: true });
    return;
  }

  if (sub === 'list') {
    const locations = listLocations(guildId);
    if (locations.length === 0) {
      await interaction.reply({ content: 'No locations configured yet.', ephemeral: true });
      return;
    }
    const lines = locations.map((l) => `• **${l.label}** (${l.retailer_name} — ${l.neighborhood_name})`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
}
