// config.js — every shared tuning constant for Neon Shores lives here so the
// world, the simulation harness and the shot staging all read the same numbers.

export const WORLD_SIZE = 3600;          // the city is a square, 3600 x 3600 px
export const ROAD_WIDTH = 110;           // asphalt width of every street
export const ROAD_PITCH = 400;           // distance between neighbouring road centrelines
export const ROAD_ORIGIN = 260;          // centreline of the first road on each axis
export const ROAD_COLS = 7;              // vertical avenues
export const ROAD_ROWS = 9;              // horizontal streets
export const BEACH_X = 3140;             // sand starts here, east edge of the map
export const SEA_X = 3380;               // open water starts here
export const PIER_Y = 1860;              // centreline of the Neon Pier
export const PIER_START_X = 3060;        // where the pier leaves the boulevard
export const PIER_END_X = 3560;          // lighthouse end of the pier

export const START_CASH = 250;           // Jax arrives in Port Azura with $250

// Heat is priced in points; 100 points make one star, five stars is the cap.
export const HEAT_PER_STAR = 100;
export const HEAT_MAX = 500;
export const HEAT_THEFT = 40;            // stealing any car
export const HEAT_ASSAULT = 30;          // punching a pedestrian, witnessed
export const HEAT_HIT_AND_RUN = 85;      // knocking a pedestrian down with a car
export const HEAT_RAM_POLICE = 110;      // ramming a police car
export const HEAT_RAM_CIVILIAN = 18;     // ramming a civilian car
export const SIGHT_RANGE = 430;          // police see the player inside this radius
export const WITNESS_RANGE = 320;        // crimes are priced when a witness is this close
export const HEAT_DECAY_DELAY = 2.5;     // seconds unseen before heat starts to fall
export const HEAT_DECAY_RATE = 9;        // heat points per second while hidden
export const POLICE_PER_STAR = [0, 1, 2, 3, 5, 6]; // index by star count

export const BUST_RANGE = 56;            // a close officer fills the bust meter
export const BUST_FILL_SECONDS = 2.6;    // cornered this long beside police = busted
export const BUST_FINE_BASE = 120;       // fine = base + per-star, capped by cash
export const BUST_FINE_PER_STAR = 40;
export const WASTED_FEE = 150;           // hospital bill, capped by cash

export const DAY_LENGTH = 300;           // one full day-night cycle, seconds
export const SAVE_KEY = 'neon-shores-save-v1';

// Vehicle classes: one row per class, read by traffic, parked cars and police.
export const CAR_CLASSES = {
  compact: { label: 'Compact', length: 34, width: 17, accel: 210, topSpeed: 235, reverse: 90,  grip: 3.4, turn: 2.9, brake: 340 },
  sedan:   { label: 'Sedan',   length: 42, width: 19, accel: 250, topSpeed: 285, reverse: 100, grip: 3.0, turn: 2.5, brake: 380 },
  sports:  { label: 'Sports',  length: 40, width: 19, accel: 360, topSpeed: 380, reverse: 110, grip: 2.6, turn: 2.7, brake: 430 },
  police:  { label: 'Interceptor', length: 43, width: 20, accel: 330, topSpeed: 350, reverse: 110, grip: 3.1, turn: 2.8, brake: 420 },
};

export const TRAFFIC_COUNT = 14;         // civilian cars rolling at any time
export const PED_COUNT = 22;             // pedestrians on the sidewalks
export const PARKED_COUNT = 16;          // stealable parked cars

export const VIEW_W = 1280;              // canvas size the game is tuned for
export const VIEW_H = 800;
