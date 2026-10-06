import {
  ButtonInteraction,
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
 * discord.js's runtime mixes `showModal` onto ModalSubmitInteraction (see
 * node_modules/discord.js/src/structures/ModalSubmitInteraction.js) so a modal submission can
 * itself open another modal, but the shipped typings (14.27.0) only declare `showModal` on
 * CommandInteraction and MessageComponentInteraction — not yet on ModalSubmitInteraction. Narrow
 * cast here once instead of `as any` at every call site.
 */
function showModalFrom(interaction: ModalSubmitInteraction, modal: ModalBuilder): Promise<unknown> {
  return (interaction as unknown as Pick<ButtonInteraction, 'showModal'>).showModal(modal);
}

/**
 * Guided report flow for members who'd rather click a button than learn a slash command:
 * report-start button -> Modal 1 (Retailer select) -> Modal 2 (Location select, + Details for
 * sightings) -> same thread-creation logic /sighting and /non-sightings already use.
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

  await showModalFrom(interaction, buildDetailsModal(flow, retailer, locations));
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
