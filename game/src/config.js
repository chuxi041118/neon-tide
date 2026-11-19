// Neon Tide — shared tuning numbers, district layout and mission scripts.
// Every value here is original: the city, the names and the story are invented.
export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const ROAD_W = 72;
export const ROAD_X = [150, 450, 750, 1050, 1350, 1650, 1950, 2250];
export const ROAD_Y = [150, 450, 750, 1050, 1350, 1650];
export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-tide-save-v1';
export const VIEW_W = 1280;
export const VIEW_H = 800;

// Districts of Port Meridian, a fictional sun-soaked harbour city.
export const DISTRICTS = {
  harbor: { name: 'Harbor', tint: '#3d5a66', ground: '#6b7c72' },
  downtown: { name: 'Downtown', tint: '#4a4a58', ground: '#7a7a72' },
  beach: { name: 'Beachfront', tint: '#c9a86a', ground: '#d9c08a' },
  suburbs: { name: 'Suburbs', tint: '#5a6b4f', ground: '#7d8f6d' },
};

/** Which district a point in the city belongs to. */
export function districtAt(x, y) {
  if (x < 750) return 'harbor';
  if (y > 1500) return 'beach';
  if (x >= 900 && x <= 1800 && y >= 600 && y <= 1200) return 'downtown';
  return 'suburbs';
}

export const PLAYER = {
  walkSpeed: 175,
  radius: 13,
  maxHealth: 100,
  meleeRange: 58,
  meleeDamage: 34,
  pistolDamage: 30,
  pistolRange: 420,
};

export const CAR = {
  accel: 420,
  brake: 620,
  maxSpeed: 430,
  maxReverse: 150,
  turnRate: 2.6,
  radius: 16,
};

// Four story missions. Each stage names a place to reach; the marker and the
// HUD objective both point at the same target.
export const MISSIONS = [
  {
    id: 'first-job',
    title: 'Mission 1 — The First Job',
    reward: 300,
    intro: 'Mara needs a courier she can trust. Pick up the package downtown, then drop it at the beach garage.',
    stages: [
      { label: 'Pick up the package at Meridian Plaza', x: 1050, y: 450 },
      { label: 'Deliver the package to the Beach Garage', x: 2250, y: 1650 },
    ],
  },
  {
    id: 'shake-heat',
    title: 'Mission 2 — Shake the Heat',
    reward: 400,
    intro: 'The harbour crew wants to see if you can lose a tail. Get the cops on you, then vanish.',
    stages: [
      { label: 'Draw police attention (2 stars)', x: 1350, y: 750, needWanted: 2 },
      { label: 'Lose the cops — stay out of sight', x: 1950, y: 450, needClear: true },
    ],
  },
  {
    id: 'harbor-heist',
    title: 'Mission 3 — Harbor Heist',
    reward: 600,
    intro: 'A mint TideRunner coupe is sitting on the docks. Take it and bring it to the chop garage.',
    stages: [
      { label: 'Steal the TideRunner at the docks', x: 450, y: 750, needCar: 'tiderunner' },
      { label: 'Deliver the TideRunner to the Chop Garage', x: 750, y: 1650 },
    ],
  },
  {
    id: 'deadline-dash',
    title: 'Mission 4 — Deadline Dash',
    reward: 800,
    intro: 'One last run: a hot parcel, ninety seconds, across the whole city. Don’t be late.',
    stages: [
      { label: 'Grab the parcel at the Harbor Gate', x: 450, y: 1050 },
      { label: 'Deliver before the timer runs out', x: 2250, y: 450, timeLimit: 90 },
    ],
  },
];

export const STORY_INTRO =
  'Port Meridian, 6:30pm. You came here with a borrowed jacket and a busted scooter. ' +
  'Mara Voss runs the harbour crew and she just offered you one job. Do it clean, and the city opens up.';

// Paint jobs for the traffic; the player car and the mission car get their own.
export const CAR_COLORS = ['#d94f3d', '#3d7ad9', '#e8b93c', '#7a4fd9', '#3dd9a0', '#d9d9d9', '#2b2b33'];
export const PED_COLORS = ['#e86a92', '#5aa86a', '#d9a03c', '#6a8ad9', '#c9c9c9', '#8a5ad9'];
