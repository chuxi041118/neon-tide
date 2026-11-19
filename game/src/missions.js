// Neon Tide — the mission and story state machine. Four jobs from Mara Voss;
// each stage is a place to reach (or a heat level to reach, or lose), with the
// same target shown on the HUD, in the world and on the minimap.
import { MISSIONS } from './config.js';

/** The mission currently being played, or null once all four are done. */
export function currentMission(state) {
  if (state.mission.allDone) return null;
  return MISSIONS[state.mission.index];
}

/** The stage the player is on now. */
export function currentStage(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.stages[state.mission.stage];
}

/** Short objective line for the HUD and the minimap legend. */
export function objectiveText(state) {
  if (state.mission.allDone) return 'All jobs done — Port Meridian is yours. Free roam!';
  const mission = currentMission(state);
  const stage = currentStage(state);
  if (!mission || !stage) return '';
  return `${mission.title}: ${stage.label}`;
}

/** Where the mission marker sits right now (world coordinates). */
export function missionTarget(state) {
  const stage = currentStage(state);
  if (!stage) return null;
  return { x: stage.x, y: stage.y };
}

/** Flash a message over the game for a few seconds. */
export function showToast(state, message, seconds = 3) {
  state.toast = message;
  state.toastTimer = seconds;
}

/** Start the next mission (or finish the set) and tell the player what it is. */
export function advanceMission(state, audio) {
  const mission = currentMission(state);
  if (!mission) return;
  state.cash += mission.reward;
  state.stats.missionsDone += 1;
  showToast(state, `${mission.title} complete — +$${mission.reward}`, 4);
  if (audio) {
    audio.missionComplete();
    audio.cash();
  }
  state.events.push({ type: 'mission', mission: mission.id, reward: mission.reward });
  state.mission.index += 1;
  state.mission.stage = 0;
  state.mission.timer = 0;
  if (state.mission.index >= MISSIONS.length) {
    state.mission.allDone = true;
    showToast(state, 'All four jobs done. Port Meridian is yours.', 5);
  } else {
    const next = MISSIONS[state.mission.index];
    showToast(state, `${next.title} — ${next.intro}`, 5);
  }
}

/**
 * Advance the mission state one step. Reaching a stage's place (or meeting its
 * heat condition) moves to the next stage; the last stage pays out.
 */
export function updateMissions(state, dt, audio) {
  const mission = currentMission(state);
  const stage = currentStage(state);
  if (!mission || !stage) return;
  const player = state.player;
  if (stage.timeLimit) {
    state.mission.timer += dt;
    if (state.mission.timer > stage.timeLimit) {
      // Too slow: the job fails and restarts from its first stage.
      state.mission.stage = 0;
      state.mission.timer = 0;
      showToast(state, 'Too slow — Mara gives you one more shot.', 4);
      return;
    }
  }
  if (stage.needWanted) {
    if (state.wanted >= stage.needWanted) {
      state.mission.stage += 1;
      showToast(state, 'They noticed you. Now vanish.', 3);
    }
    return;
  }
  if (stage.needClear) {
    if (state.wanted === 0) {
      advanceMission(state, audio);
    }
    return;
  }
  if (stage.needCar) {
    const car = player.inCar;
    if (car && car.model === stage.needCar) {
      state.mission.stage += 1;
      showToast(state, 'That’s the one. Get it to the garage.', 3);
    }
    return;
  }
  const dist = Math.hypot(player.x - stage.x, player.y - stage.y);
  if (dist < 64) {
    if (state.mission.stage + 1 >= mission.stages.length) {
      advanceMission(state, audio);
    } else {
      state.mission.stage += 1;
      state.mission.timer = 0;
      if (audio) audio.pickup();
      showToast(state, 'Objective reached.', 2);
    }
  }
}

/** Seconds left on a timed stage, or null when the stage is not timed. */
export function missionTimeLeft(state) {
  const stage = currentStage(state);
  if (!stage || !stage.timeLimit) return null;
  return Math.max(0, Math.ceil(stage.timeLimit - state.mission.timer));
}
