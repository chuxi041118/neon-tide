// Neon Tide — the player on foot and behind the wheel: walking, driving with
// acceleration and steering, stealing cars, melee and pistol combat, pickups,
// health and getting busted.
import { CAR, PLAYER, WORLD_H, WORLD_W } from './config.js';
import { collideCircleWithCity, circleHitsBuilding } from './city.js';
import { collidePlayerCarWithTraffic } from './traffic.js';
import { addWanted, policeCanSeePlayer } from './police.js';
import { ACTION_ENTER, ACTION_MELEE, ACTION_CONFIRM } from './input.js';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The nearest car the player could get into, within reach, or null. */
export function nearestCar(state, maxDist = 48) {
  let best = null;
  let bestDist = maxDist;
  for (const car of state.cars) {
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function tryEnterCar(state, audio) {
  const player = state.player;
  const car = nearestCar(state);
  if (!car) return;
  if (car.driver === 'ai') {
    const moving = Math.abs(car.speed || 0) > 40;
    // Shoving a driver out of a moving car is the crime the cops notice.
    addWanted(state, moving ? 2 : 1, moving ? 'carjacked a moving car' : 'carjacked a parked car');
    state.stats.stolen += 1;
    // The driver stumbles out and walks away.
    state.peds.push({
      x: car.x + 30, y: car.y + 10, angle: 0, speed: 60, color: '#d9a03c',
      axis: 'h', dir: 1, down: 0, phase: 0,
    });
    car.driver = null;
    car.speed = 0;
  } else if (car.kind === 'parked' || car.kind === 'mission') {
    if (policeCanSeePlayer(state)) addWanted(state, 1, 'stole a car in front of the cops');
    state.stats.stolen += 1;
  }
  car.kind = 'player';
  car.driver = 'player';
  player.inCar = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  if (audio) audio.steal();
}

function exitCar(state) {
  const player = state.player;
  const car = player.inCar;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * 30;
  player.y = car.y + Math.sin(side) * 30;
  player.angle = car.angle;
  player.onFoot = true;
  player.inCar = null;
  car.kind = 'parked';
  car.driver = null;
  car.speed = 0;
}

function driveCar(state, car, dt, input, audio) {
  const player = state.player;
  const axes = input.axes();
  // W/S (or up/down) is throttle and brake; A/D steers, harder at low speed.
  if (axes.y < 0) car.speed += CAR.accel * dt;
  else if (axes.y > 0) {
    car.speed -= car.speed > 10 ? CAR.brake * dt : CAR.accel * 0.5 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const steer = axes.x * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  car.angle += Math.sign(car.speed) * steer;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (circleHitsBuilding(state, nx, ny, CAR.radius)) {
    // Slide along the wall instead of stopping dead.
    const slideX = collideCircleWithCity(state, nx, car.y, CAR.radius);
    const slideY = collideCircleWithCity(state, car.x, ny, CAR.radius);
    if (!circleHitsBuilding(state, slideX.x, slideX.y, CAR.radius)) {
      car.x = slideX.x;
      car.y = slideX.y;
    } else if (!circleHitsBuilding(state, slideY.x, slideY.y, CAR.radius)) {
      car.x = slideY.x;
      car.y = slideY.y;
    }
    if (Math.abs(car.speed) > 200 && audio) audio.crash();
    car.speed *= 0.45;
  } else {
    car.x = Math.max(20, Math.min(WORLD_W - 20, nx));
    car.y = Math.max(20, Math.min(WORLD_H - 20, ny));
  }
  if (collidePlayerCarWithTraffic(state, car) && audio) audio.crash();
  // Running a pedestrian over is a crime the whole street sees.
  for (const ped of state.peds) {
    if (ped.down > 0) continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 120) {
      ped.down = 4;
      state.stats.hits += 1;
      addWanted(state, 1, 'hit a pedestrian');
      if (audio) audio.crash();
    }
  }
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.moving = Math.abs(car.speed) > 20;
}

function walkPlayer(state, dt, input) {
  const player = state.player;
  const axes = input.axes();
  const len = Math.hypot(axes.x, axes.y);
  player.moving = len > 0;
  if (len === 0) return;
  const nx = player.x + (axes.x / len) * PLAYER.walkSpeed * dt;
  const ny = player.y + (axes.y / len) * PLAYER.walkSpeed * dt;
  player.angle = Math.atan2(axes.y, axes.x);
  const fixed = collideCircleWithCity(state, nx, ny, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
}

function meleeAttack(state, audio) {
  const player = state.player;
  if (player.meleeCooldown > 0) return;
  player.meleeCooldown = 0.45;
  if (audio) audio.melee();
  const aim = player.angle;
  for (const cop of state.cops) {
    const d = Math.hypot(cop.x - player.x, cop.y - player.y);
    if (d < PLAYER.meleeRange && Math.abs(angleDiff(Math.atan2(cop.y - player.y, cop.x - player.x), aim)) < 1.1) {
      cop.health -= PLAYER.meleeDamage;
    }
  }
  for (const ped of state.peds) {
    const d = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (d < PLAYER.meleeRange && Math.abs(angleDiff(Math.atan2(ped.y - player.y, ped.x - player.x), aim)) < 1.1) {
      ped.down = 3;
      if (policeCanSeePlayer(state)) addWanted(state, 1, 'attacked a pedestrian');
    }
  }
  state.cops = state.cops.filter((cop) => {
    if (cop.health <= 0) {
      addWanted(state, 1, 'took down a cop');
      return false;
    }
    return true;
  });
}

function shootPistol(state, input, audio) {
  const player = state.player;
  if (player.shootCooldown > 0 || player.ammo <= 0) return;
  player.shootCooldown = 0.28;
  player.ammo -= 1;
  if (audio) audio.gunshot();
  const mouse = input.mouseWorld ? input.mouseWorld() : null;
  const aim = mouse
    ? Math.atan2(mouse.y - player.y, mouse.x - player.x)
    : player.angle;
  player.angle = aim;
  let best = null;
  let bestDist = PLAYER.pistolRange;
  const targets = [...state.cops, ...state.peds.filter((p) => p.down <= 0)];
  for (const t of targets) {
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    if (d < bestDist && Math.abs(angleDiff(Math.atan2(t.y - player.y, t.x - player.x), aim)) < 0.22) {
      best = t;
      bestDist = d;
    }
  }
  if (best) {
    if ('health' in best) {
      best.health -= PLAYER.pistolDamage;
      if (best.health <= 0) {
        state.cops = state.cops.filter((c) => c !== best);
        addWanted(state, 1, 'shot a cop');
      }
    } else {
      best.down = 3;
      addWanted(state, 1, 'shot a pedestrian');
    }
  }
  state.events.push({ type: 'shot', x: player.x + Math.cos(aim) * 30, y: player.y + Math.sin(aim) * 30, angle: aim });
}

function collectPickups(state, audio) {
  const player = state.player;
  for (const pickup of state.pickups) {
    if (pickup.active) {
      if (Math.hypot(pickup.x - player.x, pickup.y - player.y) < 32) {
        pickup.active = false;
        pickup.timer = 20;
        player.ammo += pickup.amount;
        if (audio) audio.pickup();
        state.events.push({ type: 'pickup', x: pickup.x, y: pickup.y });
      }
    } else {
      pickup.timer -= 1 / 60;
      if (pickup.timer <= 0) pickup.active = true;
    }
  }
}

function respawnAfterBusted(state, audio) {
  const player = state.player;
  player.dead = false;
  player.health = PLAYER.maxHealth;
  player.ammo = Math.max(player.ammo, 12);
  state.wanted = 0;
  state.cops = [];
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.cash = Math.max(0, state.cash - 100);
  player.inCar = null;
  player.onFoot = true;
  player.x = 1350;
  player.y = 1050;
  player.angle = -Math.PI / 2;
  if (audio) audio.busted();
  state.events.push({ type: 'busted' });
}

/** One fixed step of the player: drive or walk, fight, pick things up, stay alive. */
export function updatePlayer(state, dt, input, actions, audio) {
  const player = state.player;
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (player.dead) return;

  if (actions & ACTION_ENTER) {
    if (player.inCar) exitCar(state);
    else tryEnterCar(state, audio);
  }
  if (player.inCar) driveCar(state, player.inCar, dt, input, audio);
  else walkPlayer(state, dt, input);

  if (!player.inCar) {
    if (actions & ACTION_MELEE) meleeAttack(state, audio);
    if (input.takeClick() || (actions & ACTION_CONFIRM)) shootPistol(state, input, audio);
    collectPickups(state, audio);
  }

  // Quiet streets heal you up; the cops keep you hurt.
  if (state.wanted === 0 && player.health < PLAYER.maxHealth) {
    player.health = Math.min(PLAYER.maxHealth, player.health + 3 * dt);
  }
  if (player.health <= 0) {
    player.dead = true;
    respawnAfterBusted(state, audio);
  }
}
