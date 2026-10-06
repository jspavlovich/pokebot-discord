import { deployCommands } from './deployCommands';

// Standalone entry point for `npm run deploy-commands`. No longer strictly required day-to-day
// since src/index.ts now deploys on every bot startup too — kept around for registering
// commands without starting the full bot (e.g. right after setting CLIENT_ID/GUILD_ID for the
// first time, before anything else is configured).
deployCommands().catch((err) => {
  console.error(err);
  process.exit(1);
});
