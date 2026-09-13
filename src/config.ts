import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  // Optional: when set, slash commands deploy instantly to this one guild instead of
  // waiting up to an hour for global propagation. Recommended to always keep this set
  // since this bot is single-guild by design.
  guildId: process.env.GUILD_ID,
  databasePath: process.env.DATABASE_PATH ?? './data/pokebot.sqlite',
};
