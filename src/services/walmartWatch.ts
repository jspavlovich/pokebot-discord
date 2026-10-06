import { db } from "../db";

export interface WalmartSeenItem {
  itemId: string;
  title: string;
  url: string;
  drawKey: string;
}

export interface WalmartDrawRow {
  id: number;
  guild_id: string;
  draw_key: string;
  thread_id: string;
  created_at: number;
}

/** Whether the table has ever been populated — used to detect the first poll after deploy. */
export function hasSeenAnyItems(): boolean {
  const row = db.prepare("SELECT 1 FROM walmart_seen_items LIMIT 1").get();
  return row !== undefined;
}

export function getSeenItemIds(): Set<string> {
  const rows = db
    .prepare("SELECT item_id FROM walmart_seen_items")
    .all() as { item_id: string }[];
  return new Set(rows.map((row) => row.item_id));
}

/**
 * Records items as seen. Safe to call with items already seen (e.g. still-listed items on a
 * later poll) — the insert is simply skipped for those, title/url/draw_key intentionally not
 * refreshed since first_seen_at is what matters here, not a live mirror of the listing.
 */
export function markItemsSeen(
  items: WalmartSeenItem[],
  seenAt: number = Date.now(),
): void {
  if (items.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO walmart_seen_items (item_id, title, url, draw_key, first_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO NOTHING`,
  );
  const insertMany = db.transaction((rows: WalmartSeenItem[]) => {
    for (const item of rows) {
      insert.run(item.itemId, item.title, item.url, item.drawKey, seenAt);
    }
  });
  insertMany(items);
}

/** The forum thread already posted for this drawing, if any. */
export function findDrawThread(
  guildId: string,
  drawKey: string,
): WalmartDrawRow | undefined {
  return db
    .prepare(
      "SELECT * FROM walmart_draws WHERE guild_id = ? AND draw_key = ?",
    )
    .get(guildId, drawKey) as WalmartDrawRow | undefined;
}

/**
 * Upsert rather than plain insert: covers both a brand-new drawing and the rare case where the
 * previously-recorded thread was deleted on Discord's side and a caller is replacing it.
 */
export function createDrawThreadRecord(
  guildId: string,
  drawKey: string,
  threadId: string,
  createdAt: number = Date.now(),
): void {
  db.prepare(
    `INSERT INTO walmart_draws (guild_id, draw_key, thread_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, draw_key) DO UPDATE SET thread_id = excluded.thread_id, created_at = excluded.created_at`,
  ).run(guildId, drawKey, threadId, createdAt);
}
