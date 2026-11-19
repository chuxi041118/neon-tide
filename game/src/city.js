// Neon Tide — the city of Port Meridian: roads, districts, buildings, spawn
// points and the collision helpers every moving thing uses. No drawing here.
import {
  CAR_COLORS, DISTRICTS, PED_COLORS, ROAD_W, ROAD_X, ROAD_Y,
  WORLD_H, WORLD_W, districtAt,
} from './config.js';
import { createRandom } from './random.js';

const WATER_W = 100; // the harbour water strip along the west edge
const PARK_CHANCE = 0.14;

/** True when the point sits on a road (within half the road width of a centreline). */
export function isOnRoad(x, y) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

/** The nearest road centreline coordinate on one axis. */
export function nearestRoadCoord(value, roads) {
  let best = roads[0];
  for (const road of roads) if (Math.abs(road - value) < Math.abs(best - value)) best = road;
  return best;
}

/** Push a circle out of every building and the water; returns the corrected point. */
export function collideCircleWithCity(state, x, y, radius) {
  if (x < WATER_W + radius) x = WATER_W + radius;
  if (x > WORLD_W - radius) x = WORLD_W - radius;
  if (y < radius) y = radius;
  if (y > WORLD_H - radius) y = WORLD_H - radius;
  for (const b of state.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 === 0) { x = b.x + b.w + radius; continue; }
    const d = Math.sqrt(d2);
    x = cx + (dx / d) * radius;
    y = cy + (dy / d) * radius;
  }
  return { x, y };
}

/** True when a circle overlaps any building or the harbour water. */
export function circleHitsBuilding(state, x, y, radius) {
  if (x - radius < WATER_W) return true;
  for (const b of state.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

function buildCityBlocks(rng) {
  const buildings = [];
  const parks = [];
  const roofPalettes = {
    harbor: ['#4d6b7a', '#5d7a6b', '#6b5d4d'],
    downtown: ['#3d4a6b', '#6b3d4a', '#4a3d6b', '#556070'],
    beach: ['#c98a5a', '#d9b06a', '#e8d9a0'],
    suburbs: ['#6b7a5a', '#7a6b5a', '#5a7a6b'],
  };
  for (let i = 0; i < ROAD_X.length - 1; i += 1) {
    for (let j = 0; j < ROAD_Y.length - 1; j += 1) {
      const x0 = ROAD_X[i] + ROAD_W / 2 + 10;
      const x1 = ROAD_X[i + 1] - ROAD_W / 2 - 10;
      const y0 = ROAD_Y[j] + ROAD_W / 2 + 10;
      const y1 = ROAD_Y[j + 1] - ROAD_W / 2 - 10;
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      const district = districtAt(midX, midY);
      if (rng.next() < PARK_CHANCE) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district });
        continue;
      }
      const roofs = roofPalettes[district];
      if (rng.next() < 0.45) {
        // One big block-filling building.
        buildings.push({
          x: x0 + 8, y: y0 + 8, w: x1 - x0 - 16, h: y1 - y0 - 16,
          color: rng.pick(roofs), district, tall: district === 'downtown',
        });
      } else {
        // Two smaller buildings side by side.
        const gap = 14;
        const w2 = (x1 - x0 - gap) / 2;
        buildings.push({
          x: x0, y: y0 + 6, w: w2, h: y1 - y0 - 12,
          color: rng.pick(roofs), district, tall: false,
        });
        buildings.push({
          x: x0 + w2 + gap, y: y0 + 6, w: w2, h: y1 - y0 - 12,
          color: rng.pick(roofs), district, tall: district === 'downtown' && rng.next() < 0.5,
        });
      }
    }
  }
  return { buildings, parks };
}

function spawnParkedCars(state, rng) {
  const cars = [];
  let made = 0;
  let guard = 0;
  while (made < 16 && guard < 400) {
    guard += 1;
    const horizontal = rng.next() < 0.5;
    const road = horizontal ? rng.pick(ROAD_X) : rng.pick(ROAD_Y);
    const along = rng.range(220, horizontal ? WORLD_H - 220 : WORLD_W - 220);
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = horizontal ? road + side * (ROAD_W / 2 - 12) : along;
    const y = horizontal ? along : road + side * (ROAD_W / 2 - 12);
    if (circleHitsBuilding(state, x, y, 20)) continue;
    if (cars.some((c) => Math.hypot(c.x - x, c.y - y) < 70)) continue;
    cars.push(makeCar(state, x, y, horizontal ? 0 : Math.PI / 2, rng.pick(CAR_COLORS), 'parked'));
    made += 1;
  }
  return cars;
}

function spawnTrafficCars(state, rng) {
  const cars = [];
  for (let i = 0; i < 11; i += 1) {
    const horizontal = rng.next() < 0.5;
    const road = horizontal ? rng.pick(ROAD_Y) : rng.pick(ROAD_X);
    const along = rng.range(200, horizontal ? WORLD_W - 200 : WORLD_H - 200);
    const dir = rng.next() < 0.5 ? -1 : 1;
    const lane = dir * 17;
    const x = horizontal ? along : road + lane;
    const y = horizontal ? road + lane : along;
    cars.push(makeCar(state, x, y, horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      rng.pick(CAR_COLORS), 'ai', { axis: horizontal ? 'h' : 'v', dir, speed: rng.range(55, 95) }));
  }
  return cars;
}

function spawnPedestrians(state, rng) {
  const peds = [];
  for (let i = 0; i < 26; i += 1) {
    const horizontal = rng.next() < 0.5;
    const road = horizontal ? rng.pick(ROAD_Y) : rng.pick(ROAD_X);
    const along = rng.range(150, horizontal ? WORLD_W - 150 : WORLD_H - 150);
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = horizontal ? along : road + side * (ROAD_W / 2 + 12);
    const y = horizontal ? road + side * (ROAD_W / 2 + 12) : along;
    if (circleHitsBuilding(state, x, y, 12)) continue;
    peds.push({
      x, y, angle: horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: rng.range(28, 52), color: rng.pick(PED_COLORS), axis: horizontal ? 'h' : 'v',
      dir: rng.next() < 0.5 ? -1 : 1, down: 0, phase: rng.range(0, Math.PI * 2),
    });
  }
  return peds;
}

/** One car object; `kind` is parked | ai | police | player | mission. */
export function makeCar(state, x, y, angle, color, kind, extra = {}) {
  return {
    x, y, angle, color, kind, speed: 0, driver: kind === 'ai' ? 'ai' : null,
    health: 100, ...extra,
  };
}

/** The whole mutable game state, freshly built from a seed. */
export function createWorld(seed) {
  const rng = createRandom(seed);
  const state = {
    seed,
    timeMin: 18 * 60 + 30, // 6:30pm, golden hour over the harbour
    elapsed: 0,
    cash: 120,
    wanted: 0,
    wantedSeenTimer: 0,
    wantedDecayTimer: 0,
    heat: 0,
    player: {
      x: 1050, y: 520, angle: -Math.PI / 2, health: 100, ammo: 24,
      inCar: null, onFoot: true, meleeCooldown: 0, shootCooldown: 0,
      invulnerable: 0, dead: false, moving: false,
    },
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    buildings: [],
    parks: [],
    mission: { index: 0, stage: 0, done: false, timer: 0, allDone: false, message: '' },
    camera: { x: 1050, y: 520 },
    toast: '',
    toastTimer: 0,
    events: [],
    muted: false,
    stats: { stolen: 0, hits: 0, missionsDone: 0 },
  };
  const city = buildCityBlocks(rng);
  state.buildings = city.buildings;
  state.parks = city.parks;
  // The mission car: a mint TideRunner coupe waiting on the docks.
  const missionCar = makeCar(state, 450, 700, Math.PI / 2, '#19d3d3', 'mission', { model: 'tiderunner' });
  state.cars.push(missionCar);
  // A starter car parked right by where the player wakes up, so E always works.
  state.cars.push(makeCar(state, 1074, 640, Math.PI / 2, '#d94f3d', 'parked'));
  state.cars.push(...spawnParkedCars(state, rng));
  state.cars.push(...spawnTrafficCars(state, rng));
  state.peds = spawnPedestrians(state, rng);
  // Ammo pickups on sidewalks around the city.
  const pickupSpots = [[1050, 510], [1350, 810], [750, 1110], [1650, 1410], [1950, 810], [450, 1410]];
  for (const [x, y] of pickupSpots) state.pickups.push({ x, y, kind: 'ammo', amount: 12, active: true, timer: 0 });
  state.districts = DISTRICTS;
  return state;
}

/** Put the world back to a fresh seeded state (used by screenshots and New Game). */
export function resetWorld(state, seed) {
  const fresh = createWorld(seed);
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}
