import type { Command } from '../types';
import * as config from './config';
import * as sighting from './sighting';
import * as sightingLocation from './sighting-location';
import * as sightingRole from './sighting-role';

export const commands: Command[] = [sighting, sightingLocation, sightingRole, config];
