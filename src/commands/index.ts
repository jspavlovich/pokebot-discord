import type { Command } from "../types";
import * as config from "./config";
import * as nonSightings from "./non-sightings";
import * as sighting from "./sighting";
import * as sightingLocation from "./sighting-location";
import * as sightingNeighborhood from "./sighting-neighborhood";
import * as sightingRetailer from "./sighting-retailer";
import * as sightingRole from "./sighting-role";

export const commands: Command[] = [
  sighting,
  nonSightings,
  sightingRetailer,
  sightingNeighborhood,
  sightingLocation,
  sightingRole,
  config,
];
