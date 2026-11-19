// Neon Tide — drawing only: the city, the cars and people in it, the HUD with
// its minimap, and the title and pause panels. The 1280x800 view is scaled to
// fit the window and centred.
import {
  DISTRICTS, ROAD_W, ROAD_X, ROAD_Y, VIEW_H, VIEW_W, WORLD_H, WORLD_W, districtAt,
} from './config.js';
import { missionTarget } from './missions.js';
import { drawMinimap } from './minimap.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', bold = false) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  /** Screen pixels -> world coordinates, for aiming the pistol with the mouse. */
  function screenToWorld(sx, sy) {
    const vx = (sx * (window.devicePixelRatio || 1) - view.x) / view.scale;
    const vy = (sy * (window.devicePixelRatio || 1) - view.y) / view.scale;
    return { x: stateCamera.x - VIEW_W / 2 + vx, y: stateCamera.y - VIEW_H / 2 + vy };
  }

  let stateCamera = { x: VIEW_W / 2, y: VIEW_H / 2 };
  let night = false;

  function drawGround(state) {
    // District ground, one tinted block per region.
    ctx.fillStyle = DISTRICTS.suburbs.ground;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = DISTRICTS.downtown.ground;
    ctx.fillRect(900, 600, 900, 600);
    ctx.fillStyle = DISTRICTS.harbor.ground;
    ctx.fillRect(0, 0, 750, WORLD_H);
    ctx.fillStyle = DISTRICTS.beach.ground;
    ctx.fillRect(0, 1500, WORLD_W, 300);
    // Harbour water with wave lines.
    ctx.fillStyle = '#2b6b8a';
    ctx.fillRect(0, 0, 100, WORLD_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let y = 60; y < WORLD_H; y += 90) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.quadraticCurveTo(50, y - 8, 88, y);
      ctx.stroke();
    }
    // Beach sand strip.
    ctx.fillStyle = '#e8d9a0';
    ctx.fillRect(0, 1660, WORLD_W, 140);
    // Parks: green with a few trees.
    for (const park of state.parks) {
      ctx.fillStyle = '#4d7a4d';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = '#2f5d33';
      const trees = Math.max(2, Math.floor(park.w / 70));
      for (let i = 0; i < trees; i += 1) {
        const tx = park.x + 30 + i * ((park.w - 60) / Math.max(1, trees - 1));
        const ty = park.y + park.h / 2 + ((i % 2) - 0.5) * 30;
        ctx.beginPath();
        ctx.arc(tx, ty, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Sidewalks, then asphalt, then centre dashes.
    ctx.fillStyle = '#9a9a92';
    for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_W / 2 - 12, 0, ROAD_W + 24, WORLD_H);
    for (const ry of ROAD_Y) ctx.fillRect(0, ry - ROAD_W / 2 - 12, WORLD_W, ROAD_W + 24);
    ctx.fillStyle = '#3a3a40';
    for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    for (const ry of ROAD_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
    ctx.fillStyle = '#e8c93c';
    for (const rx of ROAD_X) {
      for (let y = 40; y < WORLD_H; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
    }
    for (const ry of ROAD_Y) {
      for (let x = 40; x < WORLD_W; x += 64) ctx.fillRect(x, ry - 2, 30, 4);
    }
    // District name painted on the ground, big enough to read in a screenshot.
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.textAlign = 'center';
    ctx.fillText('DOWNTOWN', 1350, 900);
    ctx.fillText('HARBOR', 420, 900);
    ctx.fillText('BEACHFRONT', 1500, 1720);
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Windows: a grid of lit dots, denser on tall downtown towers.
      ctx.fillStyle = night ? '#ffd76a' : 'rgba(255,255,255,0.35)';
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(2, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 3 + b.x) % 5 === 0) continue;
          ctx.fillRect(b.x + 10 + i * ((b.w - 20) / cols), b.y + 10 + j * ((b.h - 20) / rows), 9, 12);
        }
      }
    }
  }

  function drawCarShape(car, isPlayerCar, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-19, -9, 40, 22);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-19, -11, 38, 22, 6);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = 'rgba(20,24,32,0.85)';
    ctx.fillRect(-4, -8, 12, 16);
    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.fillRect(8, -8, 4, 16);
    if (car.kind === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-8, -11, 10, 22);
      const flash = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-2, -11, 5, 5);
      ctx.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-2, 6, 5, 5);
    }
    if (car.model === 'tiderunner') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', 0, -14);
    }
    // Headlights at night.
    if (night) {
      ctx.fillStyle = 'rgba(255,240,180,0.9)';
      ctx.fillRect(17, -9, 3, 4);
      ctx.fillRect(17, 5, 3, 4);
    }
    ctx.restore();
    if (isPlayerCar) {
      ctx.strokeStyle = '#19d3d3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPerson(x, y, angle, color, down, phase) {
    ctx.save();
    ctx.translate(x, y);
    if (down > 0) {
      ctx.fillStyle = '#8a8a8a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(phase) * 1.5;
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(4, bob, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMissionMarker(state, time) {
    const target = missionTarget(state);
    if (!target) return;
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    // A beam of light so the marker reads from across the screen.
    ctx.fillStyle = 'rgba(255,61,240,0.18)';
    ctx.fillRect(target.x - 14, target.y - 130, 28, 130);
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ff3df0';
    const s = 16 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.strokeStyle = '#ff3df0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 + Math.sin(time * 4) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawWorld(state, time) {
    const cam = state.camera;
    stateCamera = cam;
    night = state.timeMin >= 20 * 60 || state.timeMin < 6 * 60;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(VIEW_W / 2 - cam.x, VIEW_H / 2 - cam.y);
    drawGround(state);
    drawBuildings(state);
    drawMissionMarker(state, time);
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      ctx.fillStyle = '#2fd95a';
      ctx.fillRect(pickup.x - 11, pickup.y - 11, 22, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pickup.x - 2, pickup.y - 8, 4, 16);
      ctx.fillRect(pickup.x - 8, pickup.y - 2, 16, 4);
    }
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.down, ped.phase);
    for (const car of state.cars) drawCarShape(car, car === state.player.inCar, time);
    for (const cop of state.cops) drawPerson(cop.x, cop.y, cop.angle, '#1c3a6b', 0, time * 6);
    // The player on foot: a teal jacket, easy to spot in a crowd.
    const player = state.player;
    if (player.onFoot && !player.dead) {
      if (player.invulnerable === 0 || Math.floor(time * 10) % 2 === 0) {
        drawPerson(player.x, player.y, player.angle, '#19d3d3', 0, time * 8);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Muzzle flashes and pickup sparkles from this frame's events.
    for (const event of state.events) {
      if (event.type === 'shot') {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(event.x, event.y);
        ctx.lineTo(event.x + Math.cos(event.angle) * 26, event.y + Math.sin(event.angle) * 26);
        ctx.stroke();
      }
    }
    if (night) {
      ctx.fillStyle = 'rgba(8,10,40,0.38)';
      ctx.fillRect(cam.x - VIEW_W / 2 - 40, cam.y - VIEW_H / 2 - 40, VIEW_W + 80, VIEW_H + 80);
    }
    ctx.restore();
  }

  function clockText(state) {
    const hh = Math.floor(state.timeMin / 60) % 24;
    const mm = Math.floor(state.timeMin % 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function drawHud(state, time) {
    const player = state.player;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Wanted stars and health, top left.
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect(14, 12, 250, 92);
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, 24, 44, 26, state.wanted > 0 ? '#ffd23c' : '#8b93a3', 'left', true);
    text(`$${state.cash}`, 24, 76, 24, '#7be495', 'left', true);
    ctx.fillStyle = '#3a1518';
    ctx.fillRect(24, 86, 150, 10);
    ctx.fillStyle = player.health > 30 ? '#37d67a' : '#ff4d4d';
    ctx.fillRect(24, 86, 150 * Math.max(0, player.health / 100), 10);
    text(`HP ${Math.ceil(player.health)}  •  AMMO ${player.ammo}`, 182, 97, 13, '#ffffff');
    text(districtAt(player.x, player.y).toUpperCase(), 24, 126, 13, '#c9d2dc', 'left', true);
    // Objective, top centre (drawn by drawObjective after the HUD).
    drawMinimap(ctx, state, VIEW_W - 214, 12, 200, 148, time);
    text(clockText(state), VIEW_W - 114, 182, 20, '#ffffff', 'center', true);
    // Speed and car hint, bottom right.
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 0.9);
      text(`${kmh} km/h`, VIEW_W - 24, VIEW_H - 24, 30, '#ffffff', 'right', true);
      text('E — get out', VIEW_W - 24, VIEW_H - 52, 14, '#c9d2dc', 'right');
    } else {
      text('E — get in a car   F — melee   Click — shoot', VIEW_W - 24, VIEW_H - 24, 14, '#c9d2dc', 'right');
    }
    // Toast, centre: wrapped so a long mission intro never runs off its box.
    if (state.toastTimer > 0) {
      ctx.font = `bold 17px ${FONT}`;
      const toastLines = wrapText(ctx, state.toast, 620);
      const tw = 640;
      const th = 14 + toastLines.length * 24 + 10;
      ctx.fillStyle = 'rgba(10,14,20,0.78)';
      ctx.fillRect((VIEW_W - tw) / 2, 168, tw, th);
      for (let i = 0; i < toastLines.length; i += 1) {
        text(toastLines[i], VIEW_W / 2, 168 + 32 + i * 24, 17, '#ffe14d', 'center', true);
      }
    }
    // Red pulse at the screen edge while wanted.
    if (state.wanted > 0) {
      ctx.strokeStyle = `rgba(255,40,40,${0.25 + 0.15 * Math.sin(time * 5)})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, VIEW_W - 10, VIEW_H - 10);
    }
  }

  function drawObjective(state) {
    // Drawn after the HUD so it sits above the minimap row: objective bar.
    const label = state._objective || '';
    if (!label) return;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.font = `bold 17px ${FONT}`;
    const w = Math.min(720, ctx.measureText(label).width + 36);
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect((VIEW_W - w) / 2, 12, w, 34);
    ctx.fillStyle = '#ff3df0';
    ctx.fillRect((VIEW_W - w) / 2, 12, 5, 34);
    text(label, VIEW_W / 2, 35, 17, '#ffffff', 'center', true);
    if (state._timeLeft !== null && state._timeLeft !== undefined) {
      text(`${state._timeLeft}s left`, VIEW_W / 2, 64, 16, '#ff6b6b', 'center', true);
    }
  }

  function drawPanel(title, lines, prompt, accent = '#19d3d3') {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const width = 720;
    const wrapped = [];
    ctx.font = `18px ${FONT}`;
    for (const line of lines) wrapped.push(...wrapText(ctx, line, width - 60));
    const height = 150 + wrapped.length * 30 + 70;
    const x = (VIEW_W - width) / 2;
    const y = (VIEW_H - height) / 2;
    ctx.fillStyle = 'rgba(8,12,20,0.88)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    text(title, VIEW_W / 2, y + 72, 52, accent, 'center', true);
    for (let i = 0; i < wrapped.length; i += 1) {
      text(wrapped[i], VIEW_W / 2, y + 118 + i * 30, 18, '#e8ecf2', 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 30, 20, '#ffe14d', 'center', true);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, options = {}) {
    const time = state.elapsed;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(state, time);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'An open-world crime story in Port Meridian — a city of harbours, beaches and bad decisions.',
        options.story || '',
        'WASD / arrows — walk & drive      E — get in / steal a car      F — melee      Click — shoot',
        'P — pause      M — mute      Your cash, jobs and position save automatically.',
      ];
      const prompt = options.hasSave
        ? 'SPACE — New Game      C — Continue your save'
        : 'SPACE or click — Start a new game';
      drawPanel('NEON TIDE', lines, prompt);
      return;
    }
    drawHud(state, time);
    drawObjective(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for you.', options.muted ? 'Sound: muted (M to unmute)' : 'Sound: on (M to mute)'], 'P — resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('BUSTED', ['Meridian General patched you up. -$100.', 'The crew is still waiting on your next job.'], 'SPACE — get back out there');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
