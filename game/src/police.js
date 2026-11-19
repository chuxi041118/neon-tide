// Neon Tide — the wanted system and the police who answer it. Crimes raise
// stars; cops chase while they can see you; stay out of sight and the heat
// slowly cools off.
import { ROAD_X, ROAD_Y } from './config.js';
import { collideCircleWithCity, makeCar } from './city.js';

export const MAX_WANTED = 5;

/** Raise the wanted level (clamped to 5) and note the crime for the HUD. */
export function addWanted(state, stars, reason) {
  if (state.wanted >= MAX_WANTED) return;
  state.wanted = Math.min(MAX_WANTED, state.wanted + stars);
  state.wantedSeenTimer = 0;
  state.wantedDecayTimer = 0;
  state.events.push({ type: 'wanted', stars: state.wanted, reason });
}

/** True when any cop or cruiser is close enough to see the player. */
export function policeCanSeePlayer(state) {
  const px = state.player.x;
  const py = state.player.y;
  for (const cop of state.cops) {
    if (Math.hypot(cop.x - px, cop.y - py) < 420) return true;
  }
  for (const car of state.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - px, car.y - py) < 460) return true;
  }
  return false;
}

/** Keep the number of police on the street matched to the wanted level. */
export function updatePoliceSpawns(state) {
  const wantCruisers = state.wanted === 0 ? 0 : Math.min(3, state.wanted);
  const cruisers = state.cars.filter((c) => c.kind === 'police');
  if (cruisers.length < wantCruisers) {
    const px = state.player.x;
    const py = state.player.y;
    const road = state.player.x > state.player.y ? ROAD_X : ROAD_Y;
    const spawn = road[Math.floor(Math.random() * road.length)];
    const cruiser = makeCar(
      state,
      state.player.x > state.player.y ? spawn : px + (Math.random() < 0.5 ? -260 : 260),
      state.player.x > state.player.y ? py + (Math.random() < 0.5 ? -260 : 260) : spawn,
      0, '#1c1c22', 'police', { axis: 'h', dir: 1, speed: 0 },
    );
    cruiser.x = Math.max(160, Math.min(2240, cruiser.x));
    cruiser.y = Math.max(160, Math.min(1640, cruiser.y));
    state.cars.push(cruiser);
  }
  if (cruisers.length > wantCruisers) {
    const extra = cruisers[cruisers.length - 1];
    state.cars.splice(state.cars.indexOf(extra), 1);
  }
  const wantFoot = state.wanted >= 2 ? Math.min(4, state.wanted) : 0;
  while (state.cops.length < wantFoot) {
    const angle = Math.random() * Math.PI * 2;
    state.cops.push({
      x: state.player.x + Math.cos(angle) * 320,
      y: state.player.y + Math.sin(angle) * 320,
      angle, speed: 120, health: 60, shootCooldown: 1 + Math.random(),
    });
  }
  while (state.cops.length > wantFoot) state.cops.pop();
}

/** Chase the player: cruisers ram the player's car, foot cops close in on foot. */
export function updatePoliceChase(state, dt, audio) {
  const player = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    const targetSpeed = dist < 80 ? 130 : Math.min(470, 300 + state.wanted * 30);
    car.speed = Math.min(targetSpeed, car.speed + 300 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = collideCircleWithCity(state, nx, ny, 16);
    car.x = fixed.x;
    car.y = fixed.y;
    // Never sit on top of the player's car: keep a visible gap in a chase.
    const ddx = car.x - player.x;
    const ddy = car.y - player.y;
    const ddist = Math.hypot(ddx, ddy);
    if (ddist > 0.01 && ddist < 42) {
      car.x = player.x + (ddx / ddist) * 42;
      car.y = player.y + (ddy / ddist) * 42;
    }
    // A cruiser ramming the player's car hurts and slows it, but only once
    // per hit (the invulnerability window gates it), so a tail cannot pin
    // the player to a standstill.
    if (player.inCar && dist < 44 && player.invulnerable <= 0) {
      const pc = player.inCar;
      pc.speed *= 0.55;
      player.health -= 3;
      player.invulnerable = 1.0;
      if (audio) audio.crash();
    }
  }
  for (const cop of state.cops) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    if (dist > 34) {
      const nx = cop.x + (dx / dist) * cop.speed * dt;
      const ny = cop.y + (dy / dist) * cop.speed * dt;
      const fixed = collideCircleWithCity(state, nx, ny, 11);
      cop.x = fixed.x;
      cop.y = fixed.y;
    } else if (!player.inCar && player.invulnerable <= 0) {
      // A cop who catches you on foot beats you down and cuffs the heat away.
      player.health -= 14 * dt;
      player.invulnerable = Math.max(player.invulnerable, 0.2);
    }
    // Foot cops shoot at a fleeing player from a distance.
    cop.shootCooldown -= dt;
    if (dist < 380 && dist > 120 && cop.shootCooldown <= 0 && player.invulnerable <= 0) {
      cop.shootCooldown = 1.6;
      player.health -= 5;
      player.invulnerable = 0.4;
      if (audio) audio.gunshot();
    }
  }
}

/** Decay: unseen for a while, the wanted level drops one star at a time. */
export function updateWantedDecay(state, dt) {
  if (state.wanted === 0) return;
  if (policeCanSeePlayer(state)) {
    state.wantedSeenTimer = 0;
    state.wantedDecayTimer = 0;
    return;
  }
  state.wantedSeenTimer += dt;
  if (state.wantedSeenTimer > 4) {
    state.wantedDecayTimer += dt;
    if (state.wantedDecayTimer > 7) {
      state.wanted -= 1;
      state.wantedDecayTimer = 0;
      state.events.push({ type: 'wanted', stars: state.wanted, reason: 'cooling off' });
    }
  }
}
