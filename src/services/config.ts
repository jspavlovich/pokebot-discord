import { db } from '../db';

export function getSightingsChannelId(guildId: string): string | undefined {
  const row = db
    .prepare('SELECT sightings_channel_id FROM guild_config WHERE guild_id = ?')
    .get(guildId) as { sightings_channel_id: string | null } | undefined;
  return row?.sightings_channel_id ?? undefined;
}

export function setSightingsChannelId(guildId: string, channelId: string): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, sightings_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET sightings_channel_id = excluded.sightings_channel_id`
  ).run(guildId, channelId);
}
