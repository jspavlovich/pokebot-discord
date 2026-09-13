import { db } from '../db';

export interface LocationView {
  id: number;
  guild_id: string;
  retailer_id: number;
  neighborhood_id: number;
  label: string;
  retailer_name: string;
  neighborhood_name: string;
  discord_role_id: string;
}

const VIEW_SELECT = `
  SELECT
    l.id, l.guild_id, l.retailer_id, l.neighborhood_id, l.label,
    r.name AS retailer_name,
    n.name AS neighborhood_name,
    ro.role_id AS discord_role_id
  FROM locations l
  JOIN retailers r ON r.id = l.retailer_id
  JOIN neighborhoods n ON n.id = l.neighborhood_id
  JOIN roles ro ON ro.id = n.role_id
`;

export function addLocation(
  guildId: string,
  retailerId: number,
  neighborhoodId: number,
  label: string
): LocationView {
  db.prepare('INSERT INTO locations (guild_id, retailer_id, neighborhood_id, label) VALUES (?, ?, ?, ?)').run(
    guildId,
    retailerId,
    neighborhoodId,
    label
  );
  return getLocationByIds(guildId, retailerId, neighborhoodId)!;
}

export function getLocationByIds(
  guildId: string,
  retailerId: number,
  neighborhoodId: number
): LocationView | undefined {
  return db
    .prepare(`${VIEW_SELECT} WHERE l.guild_id = ? AND l.retailer_id = ? AND l.neighborhood_id = ?`)
    .get(guildId, retailerId, neighborhoodId) as LocationView | undefined;
}

export function getLocationByNames(
  guildId: string,
  retailerName: string,
  neighborhoodName: string
): LocationView | undefined {
  return db
    .prepare(`${VIEW_SELECT} WHERE l.guild_id = ? AND r.name = ? AND n.name = ?`)
    .get(guildId, retailerName, neighborhoodName) as LocationView | undefined;
}

export function getLocationById(id: number): LocationView | undefined {
  return db.prepare(`${VIEW_SELECT} WHERE l.id = ?`).get(id) as LocationView | undefined;
}

export function removeLocation(guildId: string, retailerId: number, neighborhoodId: number): void {
  db.prepare('DELETE FROM locations WHERE guild_id = ? AND retailer_id = ? AND neighborhood_id = ?').run(
    guildId,
    retailerId,
    neighborhoodId
  );
}

export function listLocations(guildId: string, retailerName?: string): LocationView[] {
  if (retailerName) {
    return db
      .prepare(`${VIEW_SELECT} WHERE l.guild_id = ? AND r.name = ? ORDER BY n.name`)
      .all(guildId, retailerName) as LocationView[];
  }
  return db.prepare(`${VIEW_SELECT} WHERE l.guild_id = ? ORDER BY r.name, n.name`).all(guildId) as LocationView[];
}

/** Retailers that actually have at least one location combo — used to drive /sighting's autocomplete. */
export function listRetailersInUse(guildId: string): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT r.name AS name FROM locations l JOIN retailers r ON r.id = l.retailer_id
       WHERE l.guild_id = ? ORDER BY r.name`
    )
    .all(guildId) as { name: string }[];
  return rows.map((r) => r.name);
}
