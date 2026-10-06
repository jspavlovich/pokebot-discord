import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import './db'; // ensures the schema exists before anything else touches the DB
import { handleInteraction } from './handlers/interactionCreate';
import { startExpireSweep } from './jobs/expireSweep';
import { startWalmartPoll } from './jobs/walmartPoll';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  startExpireSweep(client);
  startWalmartPoll(client);
});

client.on('interactionCreate', handleInteraction);

client.login(config.token);
