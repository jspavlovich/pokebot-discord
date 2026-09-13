import { db } from '../db';

export interface RoleRow {
  id: number;
  guild_id: string;
  label: string;
  role_id: string;
}

export function addRole(guildId: string, label: string, roleId: string): RoleRow {
  db.prepare('INSERT INTO roles (guild_id, label, role_id) VALUES (?, ?, ?)').run(guildId, label, roleId);
  return getRoleByLabel(guildId, label)!;
}

export function getRoleByLabel(guildId: string, label: string): RoleRow | undefined {
  return db.prepare('SELECT * FROM roles WHERE guild_id = ? AND label = ?').get(guildId, label) as
    | RoleRow
    | undefined;
}

export function getRoleById(id: number): RoleRow | undefined {
  return db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as RoleRow | undefined;
}

export function listRoles(guildId: string): RoleRow[] {
  return db.prepare('SELECT * FROM roles WHERE guild_id = ? ORDER BY label').all(guildId) as RoleRow[];
}
