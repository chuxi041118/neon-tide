// Neon Tide — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play and paused. ?shot=cover|walk|mission|night
// stages a screenshot scene instead of running the loop; ?selftest=1 plays a
// scripted end-to-end pass (walk, drive, steal, wanted, mission, shoot) and
// writes PASS or FAIL into the document title.
import { MISSIONS, SAVE_KEY, STEP, STORY_INTRO, VIEW_H, VIEW_W } from './config.js';
import { createWorld, resetWorld } from './city.js';
import {
  ACTION_CONFIRM, ACTION_CONTINUE, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE,
  createInput, createScriptedInput,
} from './input.js';
import { updatePlayer } from './player.js';
import { updatePedestrians, updateTrafficCars } from './traffic.js';
import { updatePoliceChase, updatePoliceSpawns, updateWantedDecay, addWanted } from './police.js';
import { currentStage, missionTimeLeft, objectiveText, updateMissions } from './missions.js';
import { createAudio, createSilentAudio } from './audio.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { setupShot, shotDriveInput } from './shots.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const selftest = params.get('selftest') === '1';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(seed);
const renderer = createRenderer(canvas);
let errorCount = 0;
window.addEventListener('error', () => { errorCount += 1; });

function announce(message) {
  status.textContent = message;
}

/** One fixed step of the whole simulation, in the order the systems need. */
function updateWorld(world, dt, input, actions, audio) {
  world.elapsed += dt;
  world.timeMin += dt * 0.5; // one game minute every two real seconds
  if (world.toastTimer > 0) world.toastTimer -= dt;
  updatePlayer(world, dt, input, actions, audio);
  updateTrafficCars(world, dt);
  updatePedestrians(world, dt);
  updatePoliceSpawns(world);
  updatePoliceChase(world, dt, audio);
  updateWantedDecay(world, dt);
  updateMissions(world, dt, audio);
  // The camera chases the player and never leaves the city.
  const cam = world.camera;
  cam.x += (world.player.x - cam.x) * Math.min(1, dt * 5);
  cam.y += (world.player.y - cam.y) * Math.min(1, dt * 5);
  cam.x = Math.max(VIEW_W / 2, Math.min(2400 - VIEW_W / 2, cam.x));
  cam.y = Math.max(VIEW_H / 2, Math.min(1800 - VIEW_H / 2, cam.y));
  if (audio) {
    const car = world.player.inCar;
    audio.setEngine(car ? Math.abs(car.speed) / 430 : 0, Boolean(car));
    audio.setSiren(world.wanted > 0, world.elapsed);
  }
  world._objective = objectiveText(world);
  world._timeLeft = missionTimeLeft(world);
}

/** Save cash, mission progress, position and health to this browser only. */
function saveGame(world) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.cash,
      missionIndex: world.mission.index,
      missionStage: world.mission.stage,
      x: world.player.x,
      y: world.player.y,
      health: world.player.health,
      ammo: world.player.ammo,
      timeMin: world.timeMin,
    }));
  } catch { /* storage can be off; the game still plays */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.x !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function applySave(world, save) {
  world.cash = save.cash;
  world.mission.index = Math.min(save.missionIndex, MISSIONS.length - 1);
  world.mission.stage = save.missionStage;
  world.mission.allDone = save.missionIndex >= MISSIONS.length;
  world.player.x = save.x;
  world.player.y = save.y;
  world.player.health = save.health;
  world.player.ammo = save.ammo;
  world.timeMin = save.timeMin;
  world.camera.x = save.x;
  world.camera.y = save.y;
}

/** Screenshot mode: stage the scene, play the real rules forward, paint twice. */
function runShot(name) {
  const scene = setupShot(name, state);
  window.__debugState = state; // shot mode only: lets a test read the staged world
  const input = createScriptedInput();
  const audio = createSilentAudio();
  const steps = Math.floor(scene.seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    shotDriveInput(state, scene.driveTo, input);
    updateWorld(state, STEP, input, 0, audio);
  }
  state.events = [];
  let painted = 0;
  function paint() {
    renderer.draw(state, SCREEN_PLAY, {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      document.title = 'SHOT READY';
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

/** Self-test mode: a scripted player walks, steals and drives a car, draws the
 * cops, pushes a mission forward and fires the pistol, then reports. */
function runSelftest() {
  const input = createScriptedInput();
  const audio = createSilentAudio();
  const results = { walked: 0, maxSpeed: 0, stole: false, wanted: false, police: false, mission: false, shot: false };
  const startX = state.player.x;
  const startY = state.player.y;
  // Park the player beside the nearest parked car so E has something to take.
  let car = null;
  let best = Infinity;
  for (const c of state.cars) {
    if (c.kind !== 'parked') continue;
    const d = Math.hypot(c.x - startX, c.y - startY);
    if (d < best) { best = d; car = c; }
  }
  if (car) {
    state.player.x = car.x + 34;
    state.player.y = car.y;
  }
  const ammoBefore = state.player.ammo;
  let enteredAt = -1;
  let exitedAt = -1;
  let stageBefore = 0;
  let t = 0;
  function stepOnce() {
    let actions = 0;
    input.ax = 0;
    input.ay = 0;
    if (t < 0.5) {
      // Stand still beside the car so E can reach it.
    } else if (t >= 0.5 && enteredAt < 0) {
      actions |= ACTION_ENTER;
      enteredAt = t;
    } else if (enteredAt >= 0 && t < 5) {
      shotDriveInput(state, { x: 1650, y: 1050 }, input);
    } else if (exitedAt < 0) {
      actions |= ACTION_ENTER;
      exitedAt = t;
    } else if (t < 7) {
      input.ay = -1;
    } else if (t < 7.1) {
      addWanted(state, 2, 'selftest');
    } else if (t < 9) {
      // Walk the player onto the first mission pickup to push the job on.
      const stage = currentStage(state);
      if (stage) {
        state.player.x = stage.x;
        state.player.y = stage.y;
      }
    } else if (t < 9.2) {
      input.click = true;
    }
    updateWorld(state, STEP, input, actions, audio);
    t += STEP;
    results.walked = Math.max(results.walked, Math.hypot(state.player.x - startX, state.player.y - startY));
    if (state.player.inCar) {
      results.stole = true;
      results.maxSpeed = Math.max(results.maxSpeed, Math.abs(state.player.inCar.speed));
    }
    if (state.wanted >= 2) results.wanted = true;
    if (state.cars.some((c) => c.kind === 'police')) results.police = true;
    if (state.mission.stage > stageBefore || state.mission.index > 0) results.mission = true;
    if (state.events.some((e) => e.type === 'shot')) results.shot = true;
    if (t < 10) {
      requestAnimationFrame(stepOnce);
      return;
    }
    const failures = [];
    if (!results.stole) failures.push('never got in a car');
    if (results.maxSpeed < 50) failures.push(`car never moved (max ${Math.round(results.maxSpeed)})`);
    if (!results.wanted) failures.push('wanted never rose');
    if (!results.police) failures.push('no police spawned');
    if (!results.mission) failures.push('mission never advanced');
    if (!results.shot) failures.push('pistol never fired');
    if (errorCount > 0) failures.push(`${errorCount} page errors`);
    const detail = `walked=${Math.round(results.walked)} maxSpeed=${Math.round(results.maxSpeed)} ` +
      `wanted=${state.wanted} mission=${state.mission.index}:${state.mission.stage} ammo=${state.player.ammo} errors=${errorCount}`;
    document.title = failures.length === 0 ? `SELFTEST PASS ${detail}` : `SELFTEST FAIL ${failures.join('; ')} | ${detail}`;
    window.__selftest = { pass: failures.length === 0, failures, results, errors: errorCount };
    renderer.draw(state, SCREEN_PLAY, {});
  }
  requestAnimationFrame(stepOnce);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let autosaveTimer = 0;
  let missionsDone = 0;
  let accumulator = 0;
  let last = performance.now();

  input.mouseWorld = () => {
    const m = input.mouse();
    return renderer.screenToWorld(m.x, m.y);
  };

  function startNewGame() {
    resetWorld(state, Math.floor(Math.random() * 4294967296));
    state.mission.index = 0;
    state.mission.stage = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Follow the pink marker.');
  }

  function continueGame() {
    const save = loadSave();
    if (!save) return false;
    resetWorld(state, Math.floor(Math.random() * 4294967296));
    applySave(state, save);
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Continuing your save.');
    return true;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      state.muted = audio.isMuted();
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE) continueGame();
      else if (actions & ACTION_CONFIRM) startNewGame();
      return actions;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtFrame = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dtFrame;
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_PLAY) {
      // One-shot actions (E, clicks) fire on the first step only, never twice.
      let stepActions = actions;
      while (accumulator >= STEP) {
        updateWorld(state, STEP, input, stepActions, audio);
        stepActions = 0;
        accumulator -= STEP;
        if (state.stats.missionsDone > missionsDone) {
          missionsDone = state.stats.missionsDone;
          saveGame(state);
        }
      }
      autosaveTimer += dtFrame;
      if (autosaveTimer > AUTOSAVE_SECONDS) {
        autosaveTimer = 0;
        saveGame(state);
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, { hasSave: Boolean(loadSave()), story: STORY_INTRO, muted: audio.isMuted() });
    state.events = [];
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Tide. Press Space to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else if (selftest) runSelftest();
else runGame();
