import { db } from "../db";

export function getSightingsChannelId(guildId: string): string | undefined {
  const row = db
    .prepare("SELECT sightings_channel_id FROM guild_config WHERE guild_id = ?")
    .get(guildId) as { sightings_channel_id: string | null } | undefined;
  return row?.sightings_channel_id ?? undefined;
}

export function setSightingsChannelId(
  guildId: string,
  channelId: string,
): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, sightings_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET sightings_channel_id = excluded.sightings_channel_id`,
  ).run(guildId, channelId);
}

export function getNonSightingsChannelId(guildId: string): string | undefined {
  const row = db
    .prepare(
      "SELECT non_sightings_channel_id FROM guild_config WHERE guild_id = ?",
    )
    .get(guildId) as { non_sightings_channel_id: string | null } | undefined;
  return row?.non_sightings_channel_id ?? undefined;
}

export function setNonSightingsChannelId(
  guildId: string,
  channelId: string,
): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, non_sightings_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET non_sightings_channel_id = excluded.non_sightings_channel_id`,
  ).run(guildId, channelId);
}

export function getWalmartAlertsChannelId(guildId: string): string | undefined {
  const row = db
    .prepare(
      "SELECT walmart_alerts_channel_id FROM guild_config WHERE guild_id = ?",
    )
    .get(guildId) as { walmart_alerts_channel_id: string | null } | undefined;
  return row?.walmart_alerts_channel_id ?? undefined;
}

export function setWalmartAlertsChannelId(
  guildId: string,
  channelId: string,
): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, walmart_alerts_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET walmart_alerts_channel_id = excluded.walmart_alerts_channel_id`,
  ).run(guildId, channelId);
}

export function getWalmartRoleId(guildId: string): string | undefined {
  const row = db
    .prepare("SELECT walmart_role_id FROM guild_config WHERE guild_id = ?")
    .get(guildId) as { walmart_role_id: string | null } | undefined;
  return row?.walmart_role_id ?? undefined;
}

export function setWalmartRoleId(guildId: string, roleId: string): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, walmart_role_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET walmart_role_id = excluded.walmart_role_id`,
  ).run(guildId, roleId);
}

/**
 * Every guild with a Walmart alerts forum configured — the poll target is global, but posting
 * still happens per guild. roleId is the role to ping in the post, if one's been set; pinging
 * is optional so it's nullable here even though channelId isn't.
 */
export function listWalmartAlertsChannels(): { guildId: string; channelId: string; roleId: string | undefined }[] {
  const rows = db
    .prepare(
      "SELECT guild_id, walmart_alerts_channel_id, walmart_role_id FROM guild_config WHERE walmart_alerts_channel_id IS NOT NULL",
    )
    .all() as { guild_id: string; walmart_alerts_channel_id: string; walmart_role_id: string | null }[];
  return rows.map((row) => ({
    guildId: row.guild_id,
    channelId: row.walmart_alerts_channel_id,
    roleId: row.walmart_role_id ?? undefined,
  }));
}

export function getFailureAlertsChannelId(guildId: string): string | undefined {
  const row = db
    .prepare(
      "SELECT failure_alerts_channel_id FROM guild_config WHERE guild_id = ?",
    )
    .get(guildId) as { failure_alerts_channel_id: string | null } | undefined;
  return row?.failure_alerts_channel_id ?? undefined;
}

export function setFailureAlertsChannelId(
  guildId: string,
  channelId: string,
): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, failure_alerts_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET failure_alerts_channel_id = excluded.failure_alerts_channel_id`,
  ).run(guildId, channelId);
}

/** Every guild with a failure-alerts channel configured — used by any background job that needs to report trouble. */
export function listFailureAlertsChannels(): { guildId: string; channelId: string }[] {
  const rows = db
    .prepare(
      "SELECT guild_id, failure_alerts_channel_id FROM guild_config WHERE failure_alerts_channel_id IS NOT NULL",
    )
    .all() as { guild_id: string; failure_alerts_channel_id: string }[];
  return rows.map((row) => ({ guildId: row.guild_id, channelId: row.failure_alerts_channel_id }));
}
