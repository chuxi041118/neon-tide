// Neon Tide — traffic and pedestrians: AI cars drive the road grid, pedestrians
// walk the sidewalks. Both stay on the roads, so they never clip buildings.
import { ROAD_W, ROAD_X, ROAD_Y, WORLD_H, WORLD_W } from './config.js';
import { circleHitsBuilding, nearestRoadCoord } from './city.js';

const CAR_LENGTH = 34;
const CAR_WIDTH = 18;

/** Advance every AI car one step: drive its lane, turn at intersections. */
export function updateTrafficCars(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'ai') continue;
    const speed = car.speed || 70;
    let nx = car.x;
    let ny = car.y;
    if (car.axis === 'h') nx += car.dir * speed * dt;
    else ny += car.dir * speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const crossRoads = car.axis === 'h' ? ROAD_X : ROAD_Y;
    const along = car.axis === 'h' ? nx : ny;
    const nearest = nearestRoadCoord(along, crossRoads);
    if (Math.abs(along - nearest) < speed * dt && Math.random() < 0.22) {
      const wasH = car.axis === 'h';
      car.axis = wasH ? 'v' : 'h';
      car.dir = Math.random() < 0.5 ? -1 : 1;
      const lane = car.dir * 17;
      if (wasH) { car.y = nearest + lane; car.x = nearest; }
      else { car.x = nearest + lane; car.y = nearest; }
      car.angle = car.axis === 'h' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      continue;
    }
    // Loop around the far edge instead of driving off the map.
    if (nx < 130) { nx = WORLD_W - 130; }
    if (nx > WORLD_W - 130) { nx = 130; }
    if (ny < 130) { ny = WORLD_H - 130; }
    if (ny > WORLD_H - 130) { ny = 130; }
    car.x = nx;
    car.y = ny;
  }
  // Gentle separation so traffic does not stack bumper to bumper.
  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      const a = state.cars[i];
      const b = state.cars[j];
      if (a.kind !== 'ai' || b.kind !== 'ai') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 46 * 46 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (46 - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }
}

/** Advance every pedestrian one step along its sidewalk; reverse at the map edge. */
export function updatePedestrians(state, dt) {
  for (const ped of state.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      continue;
    }
    ped.phase += dt * 6;
    let nx = ped.x;
    let ny = ped.y;
    if (ped.axis === 'h') nx += ped.dir * ped.speed * dt;
    else ny += ped.dir * ped.speed * dt;
    const limit = ped.axis === 'h' ? WORLD_W - 130 : WORLD_H - 130;
    const along = ped.axis === 'h' ? nx : ny;
    if (along < 130 || along > limit) {
      ped.dir *= -1;
      ped.angle += Math.PI;
    } else if (!circleHitsBuilding(state, nx, ny, 10)) {
      ped.x = nx;
      ped.y = ny;
    } else {
      ped.dir *= -1;
      ped.angle += Math.PI;
    }
  }
}

/** The player's car bumps traffic cars aside; returns true on a hard hit. */
export function collidePlayerCarWithTraffic(state, car) {
  let hardHit = false;
  for (const other of state.cars) {
    if (other === car || other.kind === 'player') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d2 = dx * dx + dy * dy;
    const min = CAR_LENGTH;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      other.x += (dx / d) * push;
      other.y += (dy / d) * push;
      car.x -= (dx / d) * push * 0.4;
      car.y -= (dy / d) * push * 0.4;
      if (Math.abs(car.speed) > 160) hardHit = true;
      if (other.kind === 'ai') other.speed = Math.max(30, (other.speed || 70) * 0.5);
    }
  }
  return hardHit;
}

export { CAR_LENGTH, CAR_WIDTH };
