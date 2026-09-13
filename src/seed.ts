import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import { addLocation, getLocationByIds } from './services/locations';
import { addNeighborhood, getNeighborhoodByName } from './services/neighborhoods';
import { addRetailer, getRetailerByName } from './services/retailers';
import { addRole, getRoleByLabel } from './services/roles';

interface SeedRole {
  label: string;
  roleId: string;
}

interface SeedNeighborhood {
  name: string;
  role: string;
}

interface SeedLocation {
  retailer: string;
  neighborhood: string;
  label?: string;
}

interface SeedFile {
  roles: SeedRole[];
  retailers: string[];
  neighborhoods: SeedNeighborhood[];
  locations: SeedLocation[];
}

const guildId = process.env.GUILD_ID;
if (!guildId) {
  console.error('GUILD_ID must be set in your .env — seeding is per-guild.');
  process.exit(1);
}

const seedPath = process.argv[2] ?? path.join(process.cwd(), 'seed-data.json');
if (!fs.existsSync(seedPath)) {
  console.error(`Seed file not found: ${seedPath}`);
  console.error('Copy seed-data.example.json to seed-data.json and fill in your real data, or pass a path: npm run seed -- path/to/file.json');
  process.exit(1);
}

const seed: SeedFile = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

let rolesAdded = 0;
let rolesUpdated = 0;
for (const r of seed.roles ?? []) {
  const existing = getRoleByLabel(guildId, r.label);
  if (!existing) {
    addRole(guildId, r.label, r.roleId);
    rolesAdded++;
  } else if (existing.role_id !== r.roleId) {
    db.prepare('UPDATE roles SET role_id = ? WHERE id = ?').run(r.roleId, existing.id);
    rolesUpdated++;
  }
}

let retailersAdded = 0;
for (const name of seed.retailers ?? []) {
  if (!getRetailerByName(guildId, name)) {
    addRetailer(guildId, name);
    retailersAdded++;
  }
}

let neighborhoodsAdded = 0;
let neighborhoodsUpdated = 0;
for (const n of seed.neighborhoods ?? []) {
  const role = getRoleByLabel(guildId, n.role);
  if (!role) {
    console.warn(`Skipping neighborhood "${n.name}" — no role group called "${n.role}". Add it under "roles" first.`);
    continue;
  }
  const existing = getNeighborhoodByName(guildId, n.name);
  if (!existing) {
    addNeighborhood(guildId, n.name, role.id);
    neighborhoodsAdded++;
  } else if (existing.role_id !== role.id) {
    db.prepare('UPDATE neighborhoods SET role_id = ? WHERE id = ?').run(role.id, existing.id);
    neighborhoodsUpdated++;
  }
}

let locationsAdded = 0;
let locationsUpdated = 0;
let skipped = 0;
for (const l of seed.locations ?? []) {
  const retailer = getRetailerByName(guildId, l.retailer);
  const neighborhood = getNeighborhoodByName(guildId, l.neighborhood);
  if (!retailer || !neighborhood) {
    console.warn(
      `Skipping "${l.retailer} - ${l.neighborhood}" — missing retailer or neighborhood in the catalog above.`
    );
    skipped++;
    continue;
  }
  const label = l.label ?? `${neighborhood.name} - ${retailer.name}`;
  const existing = getLocationByIds(guildId, retailer.id, neighborhood.id);
  if (!existing) {
    addLocation(guildId, retailer.id, neighborhood.id, label);
    locationsAdded++;
  } else if (existing.label !== label) {
    db.prepare('UPDATE locations SET label = ? WHERE id = ?').run(label, existing.id);
    locationsUpdated++;
  }
}

console.log(`Roles: ${rolesAdded} added, ${rolesUpdated} updated.`);
console.log(`Retailers: ${retailersAdded} added.`);
console.log(`Neighborhoods: ${neighborhoodsAdded} added, ${neighborhoodsUpdated} updated.`);
console.log(`Locations: ${locationsAdded} added, ${locationsUpdated} updated, ${skipped} skipped (missing retailer/neighborhood).`);
