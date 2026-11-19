// Neon Tide — keyboard and mouse input. Held keys give movement and driving;
// one-shot presses (enter/exit a car, pause, mute, shoot, melee) are queued as
// flags and taken once by the loop, so a press between frames is never lost.
export const ACTION_ENTER = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_MELEE = 16;
export const ACTION_CONTINUE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const ENTER = new Set(['KeyE']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const CONFIRM = new Set(['Space', 'Enter']);
const MELEE = new Set(['KeyF']);
const CONTINUE = new Set(['KeyC']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  function isCode(event, set) {
    return set.has(event.code);
  }

  window.addEventListener('keydown', (event) => {
    if (isCode(event, UP) || isCode(event, DOWN) || isCode(event, LEFT) || isCode(event, RIGHT)) {
      held.add(event.code);
      event.preventDefault();
    } else if (isCode(event, ENTER)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (isCode(event, PAUSE)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (isCode(event, MUTE)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (isCode(event, CONFIRM)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (isCode(event, MELEE)) {
      if (!event.repeat) actions |= ACTION_MELEE;
    } else if (isCode(event, CONTINUE)) {
      if (!event.repeat) actions |= ACTION_CONTINUE;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseClicked = true;
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** -1/0/1 steering and throttle axes from the held keys. */
    axes() {
      return {
        x: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        y: (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0),
      };
    },
    up() { return has(UP); },
    down() { return has(DOWN); },
    left() { return has(LEFT); },
    right() { return has(RIGHT); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    /** True once per click; cleared by takeClick(). */
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

/** A scripted input for screenshots and self-tests: the caller sets axes directly. */
export function createScriptedInput() {
  const input = {
    ax: 0, ay: 0, enter: false, melee: false, click: false,
    mouseX: 640, mouseY: 300,
    axes() { return { x: input.ax, y: input.ay }; },
    up() { return input.ay < 0; },
    down() { return input.ay > 0; },
    left() { return input.ax < 0; },
    right() { return input.ax > 0; },
    mouse() { return { x: input.mouseX, y: input.mouseY, down: input.click }; },
    takeClick() { const c = input.click; input.click = false; return c; },
    takeActions() {
      let a = 0;
      if (input.enter) a |= ACTION_ENTER;
      if (input.melee) a |= ACTION_MELEE;
      input.enter = false;
      input.melee = false;
      return a;
    },
  };
  return input;
}
