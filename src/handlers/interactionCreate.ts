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

export async function handleInteraction(interaction: Interaction) {
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
    console.error('Error handling interaction:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong running that.', ephemeral: true }).catch(() => {});
    }
  }
}
