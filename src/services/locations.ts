import { db } from '../db';

export interface LocationRow {
  id: number;
  guild_id: string;
  retailer: string;
  name: string;
  label: string;
  role_id: number;
}

export function addLocation(
  guildId: string,
  retailer: string,
  name: string,
  label: string,
  roleRowId: number
): LocationRow {
  db.prepare(
    'INSERT INTO locations (guild_id, retailer, name, label, role_id) VALUES (?, ?, ?, ?, ?)'
  ).run(guildId, retailer, name, label, roleRowId);
  return getLocation(guildId, retailer, name)!;
}

export function removeLocation(guildId: string, retailer: string, name: string): void {
  db.prepare('DELETE FROM locations WHERE guild_id = ? AND retailer = ? AND name = ?').run(
    guildId,
    retailer,
    name
  );
}

export function getLocation(guildId: string, retailer: string, name: string): LocationRow | undefined {
  return db
    .prepare('SELECT * FROM locations WHERE guild_id = ? AND retailer = ? AND name = ?')
    .get(guildId, retailer, name) as LocationRow | undefined;
}

export function getLocationById(id: number): LocationRow | undefined {
  return db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as LocationRow | undefined;
}

export function listRetailers(guildId: string): string[] {
  const rows = db
    .prepare('SELECT DISTINCT retailer FROM locations WHERE guild_id = ? ORDER BY retailer')
    .all(guildId) as { retailer: string }[];
  return rows.map((r) => r.retailer);
}

export function listLocations(guildId: string, retailer?: string): LocationRow[] {
  if (retailer) {
    return db
      .prepare('SELECT * FROM locations WHERE guild_id = ? AND retailer = ? ORDER BY label')
      .all(guildId, retailer) as LocationRow[];
  }
  return db.prepare('SELECT * FROM locations WHERE guild_id = ? ORDER BY retailer, label').all(guildId) as LocationRow[];
}
