import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { config } from './config';

async function main() {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
