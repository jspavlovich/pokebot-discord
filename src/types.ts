import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

/**
 * Shape every command module must match. Using a loose structural type (rather than
 * discord.js's specific builder types) here since adding subcommands changes the
 * builder's TS type but not its runtime shape (.name / .toJSON() always work).
 */
export interface Command {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
