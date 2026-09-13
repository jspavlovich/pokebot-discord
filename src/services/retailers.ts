import { db } from '../db';

export interface RetailerRow {
  id: number;
  guild_id: string;
  name: string;
}

export function addRetailer(guildId: string, name: string): RetailerRow {
  db.prepare('INSERT INTO retailers (guild_id, name) VALUES (?, ?)').run(guildId, name);
  return getRetailerByName(guildId, name)!;
}

export function getRetailerByName(guildId: string, name: string): RetailerRow | undefined {
  return db.prepare('SELECT * FROM retailers WHERE guild_id = ? AND name = ?').get(guildId, name) as
    | RetailerRow
    | undefined;
}

export function getRetailerById(id: number): RetailerRow | undefined {
  return db.prepare('SELECT * FROM retailers WHERE id = ?').get(id) as RetailerRow | undefined;
}

export function listRetailers(guildId: string): RetailerRow[] {
  return db.prepare('SELECT * FROM retailers WHERE guild_id = ? ORDER BY name').all(guildId) as RetailerRow[];
}

export function removeRetailer(guildId: string, name: string): void {
  db.prepare('DELETE FROM retailers WHERE guild_id = ? AND name = ?').run(guildId, name);
}
