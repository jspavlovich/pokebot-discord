import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

const dir = path.dirname(config.databasePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA_VERSION = 7;
const currentVersion = db.pragma("user_version", { simple: true }) as number;

// v2: retailer / location name / role label need case-insensitive matching (COLLATE NOCASE)
// so "Target" and "target" resolve to the same row instead of silently fragmenting into two.
// v3: locations.name renamed to locations.location for clarity.
// v4: retailer and location are now their own catalogs (retailers, neighborhoods), each picked
// from a list rather than freely typed, so spelling can't drift across entries. "locations" is
// now the join of a retailer + neighborhood, with a label that defaults to "Neighborhood - Retailer"
// but can be overridden. The role lives on the neighborhood now, not repeated per retailer combo.
// Dropping and recreating is safe here since this only ever runs pre-launch with test data;
// a real migration with data preservation would be needed once production data exists.
if (currentVersion < 2) {
  db.exec(`
    DROP TABLE IF EXISTS sighting_threads;
    DROP TABLE IF EXISTS locations;
    DROP TABLE IF EXISTS roles;
  `);
} else if (currentVersion < 3) {
  db.exec(`
    DROP TABLE IF EXISTS sighting_threads;
    DROP TABLE IF EXISTS locations;
  `);
} else if (currentVersion < 4) {
  db.exec(`
    DROP TABLE IF EXISTS sighting_threads;
    DROP TABLE IF EXISTS locations;
    DROP TABLE IF EXISTS neighborhoods;
    DROP TABLE IF EXISTS retailers;
  `);
}

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  sightings_channel_id TEXT,
  non_sightings_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  label TEXT NOT NULL COLLATE NOCASE,
  role_id TEXT NOT NULL,
  UNIQUE(guild_id, label)
);

CREATE TABLE IF NOT EXISTS retailers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS neighborhoods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  retailer_id INTEGER NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  neighborhood_id INTEGER NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  UNIQUE(guild_id, retailer_id, neighborhood_id)
);

CREATE TABLE IF NOT EXISTS sighting_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  last_ping_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_lookup
  ON sighting_threads (guild_id, location_id, status, created_at);

-- Global, not per-guild: the Walmart poll target is one fixed URL, not something guilds
-- configure differently. item_id is Walmart's own product id, not our own autoincrement.
-- draw_key records which drawing grouping the item belonged to when first seen, for debugging.
CREATE TABLE IF NOT EXISTS walmart_seen_items (
  item_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  draw_key TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL
);

-- One forum thread per distinct drawing (guild-scoped, unlike walmart_seen_items, since the
-- forum channel posted into is a per-guild config choice).
CREATE TABLE IF NOT EXISTS walmart_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  draw_key TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, draw_key)
);
`);

const guildConfigColumns = db.pragma("table_info(guild_config)") as {
  name: string;
}[];
if (
  !guildConfigColumns.some(
    (column) => column.name === "non_sightings_channel_id",
  )
) {
  db.exec("ALTER TABLE guild_config ADD COLUMN non_sightings_channel_id TEXT");
}
if (
  !guildConfigColumns.some(
    (column) => column.name === "walmart_alerts_channel_id",
  )
) {
  db.exec("ALTER TABLE guild_config ADD COLUMN walmart_alerts_channel_id TEXT");
}
if (
  !guildConfigColumns.some(
    (column) => column.name === "failure_alerts_channel_id",
  )
) {
  db.exec("ALTER TABLE guild_config ADD COLUMN failure_alerts_channel_id TEXT");
}
if (
  !guildConfigColumns.some(
    (column) => column.name === "walmart_role_id",
  )
) {
  db.exec("ALTER TABLE guild_config ADD COLUMN walmart_role_id TEXT");
}

db.pragma(`user_version = ${SCHEMA_VERSION}`);
