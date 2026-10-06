import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import './db'; // ensures the schema exists before anything else touches the DB
import { deployCommands } from './deployCommands';
import { handleInteraction } from './handlers/interactionCreate';
import { startExpireSweep } from './jobs/expireSweep';
import { startWalmartPoll } from './jobs/walmartPoll';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  // Re-registering on every boot keeps Discord's command list in sync with the code without a
  // separate manual step — failing to do so shouldn't take the whole bot down, just means
  // whatever changed since the last successful deploy isn't live yet.
  await deployCommands().catch((err) => console.error('Failed to deploy commands on startup:', err));
  startExpireSweep(client);
  startWalmartPoll(client);
});

client.on('interactionCreate', handleInteraction);

client.login(config.token);
