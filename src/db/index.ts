import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { extractDrawDateKey } from "../util/walmartDraw";

const dir = path.dirname(config.databasePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA_VERSION = 9;
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

// v8: walmart_seen_items was keyed by item_id alone, on the assumption each Walmart product
// listing belongs to exactly one drawing. Walmart actually reuses the same item_id across
// successive drawing events (updating the DRAW_ELIGIBLE badge's date/time each time), so an
// item already seen for an earlier drawing was permanently filtered out of "new" items even
// once it came back around with a new draw_key — silently dropping real alerts. Rebuilding
// with a composite (item_id, draw_key) key (and keeping the data, since this now runs against
// real production history) fixes that: the same item_id is "new" again whenever its draw_key
// changes.
if (currentVersion > 0 && currentVersion < 8) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS walmart_seen_items_v8 (
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      draw_key TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      PRIMARY KEY (item_id, draw_key)
    );
    INSERT OR IGNORE INTO walmart_seen_items_v8 (item_id, title, url, draw_key, first_seen_at)
      SELECT item_id, title, url, draw_key, first_seen_at FROM walmart_seen_items;
    DROP TABLE walmart_seen_items;
    ALTER TABLE walmart_seen_items_v8 RENAME TO walmart_seen_items;
  `);
}

// v9: draw_key's meaning changes from "Walmart's raw badge text" to "the calendar date (Pacific)
// that drawing falls on". Walmart reuses the same badge slot across a drawing's lifecycle with
// different wording *and* a different instant ("Drawing entry window" + a start time, then later
// "Drawing results by" + a deadline time for the same event) — the raw text was never a stable
// identity for one drawing, which is what let one drawing get split into two seen-item rows / two
// forum threads. Re-key existing rows through the same date parser used going forward via a
// table rebuild (not an in-place UPDATE) because two old rows can collapse onto the same new key
// — exactly the bug being fixed — which an UPDATE would hit as a primary-key conflict; rebuilding
// oldest-first with INSERT OR IGNORE keeps the earliest of any such pair and drops the later
// duplicate.
if (currentVersion > 0 && currentVersion < 9) {
  const reKeyDrawKey = (oldKey: string): string => extractDrawDateKey(oldKey) ?? oldKey;

  db.exec(`
    CREATE TABLE IF NOT EXISTS walmart_seen_items_v9 (
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      draw_key TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      PRIMARY KEY (item_id, draw_key)
    );
  `);
  const seenItemRows = db
    .prepare("SELECT item_id, title, url, draw_key, first_seen_at FROM walmart_seen_items ORDER BY first_seen_at ASC")
    .all() as { item_id: string; title: string; url: string; draw_key: string; first_seen_at: number }[];
  const insertSeenItemV9 = db.prepare(
    `INSERT OR IGNORE INTO walmart_seen_items_v9 (item_id, title, url, draw_key, first_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const row of seenItemRows) {
      insertSeenItemV9.run(row.item_id, row.title, row.url, reKeyDrawKey(row.draw_key), row.first_seen_at);
    }
  })();
  db.exec(`
    DROP TABLE walmart_seen_items;
    ALTER TABLE walmart_seen_items_v9 RENAME TO walmart_seen_items;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS walmart_draws_v9 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      draw_key TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(guild_id, draw_key)
    );
  `);
  const drawRows = db
    .prepare("SELECT guild_id, draw_key, thread_id, created_at FROM walmart_draws ORDER BY created_at ASC")
    .all() as { guild_id: string; draw_key: string; thread_id: string; created_at: number }[];
  const insertDrawV9 = db.prepare(
    `INSERT OR IGNORE INTO walmart_draws_v9 (guild_id, draw_key, thread_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const row of drawRows) {
      insertDrawV9.run(row.guild_id, reKeyDrawKey(row.draw_key), row.thread_id, row.created_at);
    }
  })();
  db.exec(`
    DROP TABLE walmart_draws;
    ALTER TABLE walmart_draws_v9 RENAME TO walmart_draws;
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
-- Keyed on (item_id, draw_key) rather than item_id alone: Walmart reuses the same item_id
-- across separate drawing events, so the same product coming back around for a new drawing
-- (a new draw_key) must still count as "new" and get posted/pinged again.
CREATE TABLE IF NOT EXISTS walmart_seen_items (
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  draw_key TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, draw_key)
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
