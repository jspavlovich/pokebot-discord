import { db } from '../db';

export type ThreadStatus = 'active' | 'cleared' | 'expired';

export interface ThreadRow {
  id: number;
  guild_id: string;
  location_id: number;
  thread_id: string;
  status: ThreadStatus;
  created_at: number;
  last_ping_at: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETAG_WINDOW_MS = 3 * 60 * 60 * 1000;

/** A thread only counts as "active" for reuse if it's status=active AND created within the last 24h. */
export function findActiveThread(guildId: string, locationId: number): ThreadRow | undefined {
  const cutoff = Date.now() - DAY_MS;
  return db
    .prepare(
      `SELECT * FROM sighting_threads
       WHERE guild_id = ? AND location_id = ? AND status = 'active' AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(guildId, locationId, cutoff) as ThreadRow | undefined;
}

export function createThreadRecord(guildId: string, locationId: number, threadId: string): ThreadRow {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO sighting_threads (guild_id, location_id, thread_id, status, created_at, last_ping_at)
       VALUES (?, ?, ?, 'active', ?, ?)`
    )
    .run(guildId, locationId, threadId, now, now);
  return db.prepare('SELECT * FROM sighting_threads WHERE id = ?').get(info.lastInsertRowid) as ThreadRow;
}

export function touchPing(threadRowId: number): void {
  db.prepare('UPDATE sighting_threads SET last_ping_at = ? WHERE id = ?').run(Date.now(), threadRowId);
}

export function markCleared(threadRowId: number): void {
  db.prepare(`UPDATE sighting_threads SET status = 'cleared' WHERE id = ?`).run(threadRowId);
}

export function markExpired(threadRowId: number): void {
  db.prepare(`UPDATE sighting_threads SET status = 'expired' WHERE id = ?`).run(threadRowId);
}

export function getThreadByThreadId(threadId: string): ThreadRow | undefined {
  return db.prepare('SELECT * FROM sighting_threads WHERE thread_id = ?').get(threadId) as ThreadRow | undefined;
}

/** Threads still marked active whose 24h window has passed and need to be swept to "expired". */
export function findStaleActiveThreads(): ThreadRow[] {
  const cutoff = Date.now() - DAY_MS;
  return db
    .prepare(`SELECT * FROM sighting_threads WHERE status = 'active' AND created_at <= ?`)
    .all(cutoff) as ThreadRow[];
}
