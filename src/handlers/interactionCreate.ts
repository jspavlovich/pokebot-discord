import { Interaction } from 'discord.js';
import { commands } from '../commands';
import { handleClearButton } from './buttons';
import {
  handleReportContinueButton,
  handleReportDetailsModalSubmit,
  handleReportStartButton,
  handleRetailerModalSubmit,
} from './reportFlow';

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

/** Short identifier for an interaction, for logging. */
function describeInteraction(interaction: Interaction): string {
  if (interaction.isChatInputCommand()) return `/${interaction.commandName}`;
  if (interaction.isButton() || interaction.isModalSubmit()) return interaction.customId;
  return interaction.type.toString();
}

export async function handleInteraction(interaction: Interaction) {
  // Autocomplete fires on every keystroke of an autocomplete field, not a deliberate user
  // action, so it's excluded here to avoid flooding the logs.
  if (!interaction.isAutocomplete()) {
    console.log(`[interaction] ${describeInteraction(interaction)} by ${interaction.user.tag} in guild ${interaction.guildId}`);
  }

  try {
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'sighting-clear') {
      await handleClearButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('report-start:')) {
      await handleReportStartButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('report-continue:')) {
      await handleReportContinueButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('report-retailer:')) {
      await handleRetailerModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('report-details:')) {
      await handleReportDetailsModalSubmit(interaction);
      return;
    }
  } catch (err) {
    console.error(`[interaction] ${describeInteraction(interaction)} by ${interaction.user.tag} in guild ${interaction.guildId} failed:`, err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong running that.', ephemeral: true }).catch(() => {});
    }
  }
}
