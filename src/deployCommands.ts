import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { config } from './config';

/**
 * Registers the current command set with Discord. A plain REST PUT, not additive — it fully
 * replaces whatever's currently registered, so calling this on every bot startup (as well as
 * via the standalone `npm run deploy-commands` script) is safe and idempotent: commands that
 * didn't change are just re-sent as-is, and adding/editing a command takes effect without a
 * separate manual step. Guild-scoped (the normal case here, via GUILD_ID) applies instantly;
 * global registration can take up to an hour to propagate either way.
 */
export async function deployCommands(): Promise<void> {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`Deployed ${body.length} commands to guild ${config.guildId} (instant).`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Deployed ${body.length} global commands (can take up to an hour to propagate).`);
  }
}
