// Neon Tide — the minimap: the whole city shrunk into a corner, with the
// player, cars, police, the mission marker and north always visible.
import { ROAD_X, ROAD_Y, WORLD_H, WORLD_W } from './config.js';
import { missionTarget } from './missions.js';

/** Paint the minimap at (x, y) with size w x h on the given 2D context. */
export function drawMinimap(ctx, state, x, y, w, h, time) {
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 20, 0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3dd9a0';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // Water on the west edge, sand on the south edge.
  ctx.fillStyle = '#2b6b8a';
  ctx.fillRect(x, y, 100 * sx, h);
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(x, y + (WORLD_H - 160) * sy, w, 160 * sy);
  // Roads.
  ctx.strokeStyle = '#c7ccd4';
  ctx.lineWidth = 3;
  for (const rx of ROAD_X) {
    ctx.beginPath();
    ctx.moveTo(x + rx * sx, y);
    ctx.lineTo(x + rx * sx, y + h);
    ctx.stroke();
  }
  for (const ry of ROAD_Y) {
    ctx.beginPath();
    ctx.moveTo(x, y + ry * sy);
    ctx.lineTo(x + w, y + ry * sy);
    ctx.stroke();
  }
  // Mission marker: a magenta diamond that pulses.
  const target = missionTarget(state);
  if (target) {
    const pulse = 5 + Math.sin(time * 4) * 2;
    ctx.fillStyle = '#ff3df0';
    ctx.beginPath();
    ctx.moveTo(x + target.x * sx, y + target.y * sy - pulse - 3);
    ctx.lineTo(x + target.x * sx + pulse, y + target.y * sy);
    ctx.lineTo(x + target.x * sx, y + target.y * sy + pulse + 3);
    ctx.lineTo(x + target.x * sx - pulse, y + target.y * sy);
    ctx.closePath();
    ctx.fill();
  }
  // Traffic cars, then police, then the player on top.
  for (const car of state.cars) {
    if (car.kind === 'police') continue;
    ctx.fillStyle = '#e8b93c';
    ctx.fillRect(x + car.x * sx - 2, y + car.y * sy - 2, 4, 4);
  }
  const flash = Math.floor(time * 3) % 2 === 0;
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
    ctx.fillRect(x + car.x * sx - 3, y + car.y * sy - 3, 6, 6);
  }
  for (const cop of state.cops) {
    ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
    ctx.fillRect(x + cop.x * sx - 2, y + cop.y * sy - 2, 4, 4);
  }
  const px = x + state.player.x * sx;
  const py = y + state.player.y * sy;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#19d3d3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.stroke();
  // North arrow.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('N ↑', x + 6, y + 15);
  ctx.restore();
}
