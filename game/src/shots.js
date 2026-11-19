// Neon Tide — the screenshot scenes behind ?shot=cover|walk|mission|night.
// Each one stages a real game state (a real car, real cops, a real mission)
// and then plays the real rules forward, so the frame is what the game really
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { makeCar, resetWorld } from './city.js';
import { addWanted } from './police.js';

const SEED = 7;

/** Put the player into a car (the nearest parked one) and drive it. */
function putPlayerInNearestCar(state) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked') continue;
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  if (!best) return;
  best.kind = 'player';
  best.driver = 'player';
  state.player.inCar = best;
  state.player.onFoot = false;
  state.player.x = best.x;
  state.player.y = best.y;
  state.player.angle = best.angle;
}

/**
 * Stage the named scene on a fresh seeded world and describe how long the
 * autopilot should drive it. The caller runs the real update loop for
 * `seconds` with `driveTo` as the steering target (null: stand still).
 */
export function setupShot(name, state) {
  resetWorld(state, SEED);
  state.muted = true;
  if (name === 'walk') {
    // On foot downtown, mid-morning errand: the first pickup marker ahead.
    state.player.x = 1050;
    state.player.y = 560;
    state.player.angle = -Math.PI / 2;
    state.mission.index = 0;
    state.mission.stage = 0;
    state.timeMin = 10 * 60 + 15;
    return { seconds: 7, driveTo: { x: 1050, y: 470 } };
  }
  if (name === 'mission') {
    // On foot at the docks, the mint TideRunner coupe waiting to be taken.
    state.player.x = 500;
    state.player.y = 790;
    state.player.angle = -Math.PI / 2;
    state.mission.index = 2;
    state.mission.stage = 0;
    state.timeMin = 17 * 60 + 40;
    return { seconds: 5, driveTo: null };
  }
  if (name === 'night') {
    // Night run along Beachfront with one star of heat and the delivery ahead.
    // Stage the car on the beach road facing east so the run is a straight shot.
    state.player.x = 1950;
    state.player.y = 1650;
    putPlayerInNearestCar(state);
    const nightCar = state.player.inCar;
    if (nightCar) {
      nightCar.x = 1950;
      nightCar.y = 1650;
      nightCar.angle = 0;
      nightCar.speed = 0;
    }
    state.player.x = 1950;
    state.player.y = 1650;
    state.player.angle = 0;
    addWanted(state, 1, 'speeding past a patrol');
    // Stage the patrol cruiser behind the player on the same road.
    const nightCruiser = makeCar(state, 1790, 1650, 0, '#1c1c22', 'police', { axis: 'h', dir: 1, speed: 200 });
    state.cars.push(nightCruiser);
    // Stage 0 of the first job: its pickup is far away, so the run cannot
    // complete the mission mid-shot and swap the objective.
    state.mission.index = 0;
    state.mission.stage = 0;
    state.timeMin = 22 * 60 + 15;
    return { seconds: 1.5, driveTo: { x: 2250, y: 1650 } };
  }
  // Cover: the chase. Player driving south down the Meridian Ave road, two
  // stars, two cruisers closing in, the delivery marker and minimap on screen.
  state.player.x = 1074;
  state.player.y = 600;
  putPlayerInNearestCar(state);
  addWanted(state, 2, 'stole a car downtown');
  // Stage one cruiser right behind the player so the chase is in the frame.
  const coverCruiser = makeCar(state, 1074, 440, Math.PI / 2, '#1c1c22', 'police', { axis: 'v', dir: 1, speed: 200 });
  state.cars.push(coverCruiser);
  state.mission.index = 0;
  state.mission.stage = 1;
  state.timeMin = 18 * 60 + 45;
  return { seconds: 2.5, driveTo: { x: 1050, y: 1650 } };
}

/** Steering for the shot autopilot: throttle toward `target`, else stand still. */
export function shotDriveInput(state, target, input) {
  if (!target) {
    input.ax = 0;
    input.ay = 0;
    return;
  }
  const player = state.player;
  const dist = Math.hypot(target.x - player.x, target.y - player.y);
  // Arrived: stop instead of circling the target forever.
  if (dist < 40) {
    input.ax = 0;
    input.ay = 0;
    return;
  }
  const wantAngle = Math.atan2(target.y - player.y, target.x - player.x);
  let diff = wantAngle - player.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  input.ax = diff > 0.15 ? 1 : diff < -0.15 ? -1 : 0;
  // On foot, ay is the walk axis; in a car it is the throttle. Either way,
  // -1 moves the player toward the target.
  input.ay = -1;
  if (player.inCar && Math.abs(diff) > 1.2) input.ay = 0;
}

export { STEP };
