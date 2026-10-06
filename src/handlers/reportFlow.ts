import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { listLocations, listRetailersInUse } from '../services/locations';
import { reportSighting } from '../commands/sighting';
import { reportNonSighting } from '../commands/non-sightings';

/**
 * Guided report flow for members who'd rather click a button than learn a slash command:
 * report-start button -> Modal 1 (Retailer select) -> Continue button -> Modal 2 (Location
 * select, + Details for sightings) -> same thread-creation logic /sighting and /non-sightings
 * already use.
 *
 * Discord does not allow responding to a modal submission with another modal — only a button or
 * select-menu interaction can open one (confirmed both by discord.js's source, which explicitly
 * excludes `showModal` when mixing response methods onto ModalSubmitInteraction, and by Discord's
 * own API team: https://github.com/discord/discord-api-docs/discussions/4559). So Modal 1's
 * submit handler can't open Modal 2 directly; it replies with a Continue button instead, and
 * Modal 2 opens from that button click.
 *
 * See docs/design/guided-sighting-report.md for the full design, including why a global
 * 25-option-per-select / 5-field-per-modal cap doesn't bite here: listRetailersInUse() only
 * returns retailers that already have at least one location on file, so every combo this flow
 * can produce is guaranteed valid — there's no "unmatched" case to handle.
 */
type ReportFlow = 'sighting' | 'nonsighting';

function parseFlow(value: string | undefined): ReportFlow | undefined {
  return value === 'sighting' || value === 'nonsighting' ? value : undefined;
}

function flowTitle(flow: ReportFlow): string {
  return flow === 'sighting' ? 'Report a Sighting' : 'Report No Stock';
}

function buildRetailerModal(flow: ReportFlow, retailers: string[]): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`report-retailer:${flow}`)
    .setTitle(flowTitle(flow))
    .addLabelComponents(
      new LabelBuilder().setLabel('Retailer').setStringSelectMenuComponent((select) =>
        select
          .setCustomId('retailer')
          .setMinValues(1)
          .setMaxValues(1)
          // Defensive cap — the select menu API itself hard-rejects more than 25 options.
          // See the "25-cap scaling" note in docs/design/guided-sighting-report.md.
          .addOptions(retailers.slice(0, 25).map((retailer) => ({ label: retailer, value: retailer })))
      )
    );
}

function buildDetailsModal(
  flow: ReportFlow,
  retailer: string,
  locations: { label: string; neighborhood_name: string }[]
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`report-details:${flow}:${retailer}`)
    .setTitle(flowTitle(flow))
    .addLabelComponents(
      new LabelBuilder().setLabel('Location').setStringSelectMenuComponent((select) =>
        select
          .setCustomId('location')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            locations.slice(0, 25).map((l) => ({ label: l.label, value: l.neighborhood_name }))
          )
      )
    );

  if (flow === 'sighting') {
    modal.addLabelComponents(
      new LabelBuilder().setLabel('Details').setTextInputComponent((input) =>
        input.setCustomId('details').setStyle(TextInputStyle.Paragraph).setRequired(true)
      )
    );
  }

  return modal;
}

export async function handleReportStartButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This only works in a server.', ephemeral: true });
    return;
  }

  const flow = parseFlow(interaction.customId.split(':')[1]);
  if (!flow) return;

  const retailers = listRetailersInUse(guildId);
  if (retailers.length === 0) {
    await interaction.reply({
      content: 'No retailers are configured yet. Ask a mod to set one up with `/sighting-location add`.',
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(buildRetailerModal(flow, retailers));
}

export async function handleRetailerModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This only works in a server.', ephemeral: true });
    return;
  }

  const flow = parseFlow(interaction.customId.split(':')[1]);
  if (!flow) return;

  const retailer = interaction.fields.getStringSelectValues('retailer')[0];
  const locations = listLocations(guildId, retailer);
  if (locations.length === 0) {
    await interaction.reply({
      content: `No locations are configured for ${retailer} yet. Ask a mod to set one up with \`/sighting-location add\`.`,
      ephemeral: true,
    });
    return;
  }

  // Can't open Modal 2 from here (see the file-level comment) — reply with a Continue button;
  // handleReportContinueButton opens Modal 2 once it's clicked.
  const continueRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`report-continue:${flow}:${retailer}`)
      .setLabel('Continue')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({
    content: `**${retailer}** selected. Click Continue to pick a location.`,
    components: [continueRow],
    ephemeral: true,
  });
}

export async function handleReportContinueButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This only works in a server.', ephemeral: true });
    return;
  }

  // customId is `report-continue:<flow>:<retailer>` — split with a 2-part limit so a retailer
  // name containing ":" still round-trips.
  const [, flowPart, ...rest] = interaction.customId.split(':');
  const flow = parseFlow(flowPart);
  const retailer = rest.join(':');
  if (!flow || !retailer) return;

  const locations = listLocations(guildId, retailer);
  if (locations.length === 0) {
    await interaction.reply({
      content: `No locations are configured for ${retailer} yet. Ask a mod to set one up with \`/sighting-location add\`.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(buildDetailsModal(flow, retailer, locations));

  // showModal() is the interaction response; editing the message that held this button is a
  // separate call (editing the message, not responding to the interaction), so it doesn't
  // conflict with showModal() and doesn't delay the modal appearing. Without this the Continue
  // button just sits there, clickable again, after it's already been used.
  await interaction.message.edit({ components: [] }).catch(() => {});
}

export async function handleReportDetailsModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.reply({ content: 'This only works in a server.', ephemeral: true });
    return;
  }

  // customId is `report-details:<flow>:<retailer>` — split with a 2-part limit so a retailer
  // name containing ":" still round-trips.
  const [, flowPart, ...rest] = interaction.customId.split(':');
  const flow = parseFlow(flowPart);
  const retailer = rest.join(':');
  if (!flow || !retailer) return;

  const locationName = interaction.fields.getStringSelectValues('location')[0];

  if (flow === 'sighting') {
    const details = interaction.fields.getTextInputValue('details');
    await reportSighting(interaction, guildId, interaction.guild, retailer, locationName, details);
  } else {
    await reportNonSighting(interaction, guildId, interaction.guild, retailer, locationName);
  }
}
