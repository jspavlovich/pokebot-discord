import { db } from '../db';
import { formatEasternShortDate, startOfEasternDay, startOfNextEasternDay } from '../util/date';

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

/** Don't re-ping the location role more than once per this window on an already-open thread. */
export const RETAG_WINDOW_MS = 3 * 60 * 60 * 1000;

/** A thread is only worth rolling over at midnight if it was still getting real activity this close to it. */
export const HOT_ROLLOVER_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Thread title is set once at creation and never touched again — it's just the thread's
 * permanent identity (label + the Eastern calendar day it was born on), not a status readout.
 * Status lives entirely on the forum tag (Active/Cleared/Expired).
 */
export function formatThreadTitle(label: string, createdAt: number): string {
  const title = `${label} [${formatEasternShortDate(createdAt)}]`;
  return title.length > 100 ? title.slice(0, 100) : title;
}

/**
 * The thread for this location born on today's Eastern calendar day, if any — regardless of
 * status. Callers decide what to do with it: reuse it if active, reopen it if cleared. A thread
 * from any earlier day is never reused, even if this returns undefined because none exists yet.
 */
export function findTodayThread(guildId: string, locationId: number): ThreadRow | undefined {
  const todayStart = startOfEasternDay(Date.now());
  return db
    .prepare(
      `SELECT * FROM sighting_threads
       WHERE guild_id = ? AND location_id = ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(guildId, locationId, todayStart) as ThreadRow | undefined;
}

export function createThreadRecord(
  guildId: string,
  locationId: number,
  threadId: string,
  createdAt: number = Date.now()
): ThreadRow {
  const info = db
    .prepare(
      `INSERT INTO sighting_threads (guild_id, location_id, thread_id, status, created_at, last_ping_at)
       VALUES (?, ?, ?, 'active', ?, ?)`
    )
    .run(guildId, locationId, threadId, createdAt, createdAt);
  return db.prepare('SELECT * FROM sighting_threads WHERE id = ?').get(info.lastInsertRowid) as ThreadRow;
}

export function touchPing(threadRowId: number, at: number = Date.now()): void {
  db.prepare('UPDATE sighting_threads SET last_ping_at = ? WHERE id = ?').run(at, threadRowId);
}

export function markCleared(threadRowId: number): void {
  db.prepare(`UPDATE sighting_threads SET status = 'cleared' WHERE id = ?`).run(threadRowId);
}

export function reopenThread(threadRowId: number): void {
  db.prepare(`UPDATE sighting_threads SET status = 'active' WHERE id = ?`).run(threadRowId);
}

export function markExpired(threadRowId: number): void {
  db.prepare(`UPDATE sighting_threads SET status = 'expired' WHERE id = ?`).run(threadRowId);
}

export function getThreadByThreadId(threadId: string): ThreadRow | undefined {
  return db.prepare('SELECT * FROM sighting_threads WHERE thread_id = ?').get(threadId) as ThreadRow | undefined;
}

/**
 * Threads still marked active whose Eastern calendar day has ended and need to be swept.
 * Calendar-day based (not "N hours since creation") so a sweep that's late — the bot was down,
 * or just hasn't run since before midnight — still catches everything correctly on the next tick.
 */
export function findThreadsFromPastDays(): ThreadRow[] {
  const todayStart = startOfEasternDay(Date.now());
  return db
    .prepare(`SELECT * FROM sighting_threads WHERE status = 'active' AND created_at < ?`)
    .all(todayStart) as ThreadRow[];
}

/**
 * Whether a thread was still getting real activity right up against the midnight it expired at —
 * worth rolling straight into tomorrow's thread rather than just letting it die.
 */
export function isHotForRollover(row: ThreadRow): boolean {
  const dayEnd = startOfNextEasternDay(row.created_at);
  return row.last_ping_at >= dayEnd - HOT_ROLLOVER_WINDOW_MS;
}
