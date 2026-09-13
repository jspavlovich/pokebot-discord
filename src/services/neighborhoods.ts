import { db } from '../db';

export interface NeighborhoodRow {
  id: number;
  guild_id: string;
  name: string;
  role_id: number;
}

export function addNeighborhood(guildId: string, name: string, roleRowId: number): NeighborhoodRow {
  db.prepare('INSERT INTO neighborhoods (guild_id, name, role_id) VALUES (?, ?, ?)').run(guildId, name, roleRowId);
  return getNeighborhoodByName(guildId, name)!;
}

export function getNeighborhoodByName(guildId: string, name: string): NeighborhoodRow | undefined {
  return db.prepare('SELECT * FROM neighborhoods WHERE guild_id = ? AND name = ?').get(guildId, name) as
    | NeighborhoodRow
    | undefined;
}

export function getNeighborhoodById(id: number): NeighborhoodRow | undefined {
  return db.prepare('SELECT * FROM neighborhoods WHERE id = ?').get(id) as NeighborhoodRow | undefined;
}

export function listNeighborhoods(guildId: string): NeighborhoodRow[] {
  return db.prepare('SELECT * FROM neighborhoods WHERE guild_id = ? ORDER BY name').all(guildId) as NeighborhoodRow[];
}

export function removeNeighborhood(guildId: string, name: string): void {
  db.prepare('DELETE FROM neighborhoods WHERE guild_id = ? AND name = ?').run(guildId, name);
}
