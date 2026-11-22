// Tunable game constants shared across modules.
export const LANE_WIDTH = 4;
export const LANES = [
  { id: 'carrot', name: 'Carrot', x: -LANE_WIDTH, color: '#f28a24' },
  { id: 'avocado', name: 'Avocado', x: 0, color: '#a8c84a' },
  { id: 'omelette', name: 'Omelette', x: LANE_WIDTH, color: '#ffd23c' },
];

export const DURATIONS = [1.5, 2, 3];

export const SPEED = { start: 15, max: 38, rampSeconds: 110, launchSeconds: 1.1 };
export const GROWTH = { start: 0.5, end: 1.65, itemsScale: 50 };
// The roll swells around the character from `startItems` until hidden at `fullItems`.
export const COAT = { startItems: 4, fullItems: 60 };
// The roll has one look at a time. Lane order: carrot, avocado, omelette.
export const ROLL = { start: 'white', byLane: ['white', 'green', 'yellow'], empty: 'black', noriSeconds: 3.5 };
export const JUMP ={ velocity: 15, gravity: 38 };

// Items the roll must hold to break through each obstacle. Ponds means one-lane ponds.
export const SMASH = { sapling: 15, tree: 40, pond: 60 };
// Below `tinyItems` a crash ends the run. Above it, the roll loses a chunk and carries on.
export const CRASH = { tinyItems: 8, loss: 0.35, minLoss: 6, invulnerable: 1.7, scatter: 6, staggerSeconds: 1.1 };

// Giant cats can't be smashed or jumped. They appear once the roll can take down trees.
export const CAT = { fromItems: SMASH.tree, chance: 0.35 };

export const smashTier = (items) => (items >= SMASH.pond ? 3 : items >= SMASH.tree ? 2 : items >= SMASH.sapling ? 1 : 0);

// Boost burners. `speed` multiplies rolling speed, `fuel` is burn seconds, `recharge` is seconds to refill.
export const BURNERS = [
  { id: 'torch', name: 'Torch', speed: 1.6, fuel: 3, recharge: 8, colors: ['#f27f1b', '#ffd23c', '#fff3b0'] },
  { id: 'blaster', name: 'Blaster', speed: 2, fuel: 1.8, recharge: 7, colors: ['#e0262b', '#ff8f3c', '#ffe9a8'] },
  { id: 'cruiser', name: 'Cruiser', speed: 1.35, fuel: 6, recharge: 9, colors: ['#2f6fe0', '#6fd0ff', '#eefaff'] },
];

// Red gates refill the burner. A gate taken with a full burner banks a spare tank instead.
export const GATE = { chance: 0.2, maxTanks: 3, fullAt: 0.9, points: 25 };

/** Rolling speed after `t` seconds, easing toward the maximum. */
export const speedAt = (t) => SPEED.start + (SPEED.max - SPEED.start) * (1 - Math.exp(-t / SPEED.rampSeconds));

/** Player scale after collecting `items`: fast early growth that eases toward the maximum. */
export const growthAt = (items) => GROWTH.start + (GROWTH.end - GROWTH.start) * (1 - Math.exp(-items / GROWTH.itemsScale));
