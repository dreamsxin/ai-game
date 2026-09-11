import { toWorld, viewBox } from './layout.js';

// 摇杆半径与死区（像素）：手指离圆心越远推得越满。
export const STICK_RADIUS = 46;
export const STICK_DEAD = 0.18;
// 右摇杆推过这个量就算扣扳机，轻推只转枪口不开火。
export const FIRE_MAG = 0.34;

const MOVE_KEYS = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
const FIRE_KEYS = new Set(['Space', 'Enter']);
const FOCUS_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const RELOAD_KEYS = new Set(['KeyR']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

const normalize = (x, y) => {
  const mag = Math.hypot(x, y);
  if (mag <= 1e-6) return { x: 0, y: 0, mag: 0 };
  const capped = Math.min(1, mag);
  return { x: (x / mag) * capped, y: (y / mag) * capped, mag: capped };
};

// 键盘 + 鼠标 + 双摇杆触屏归一成同一份输入：移动向量、期望瞄准、扣扳机、端稳、换弹。
export function createInput(target = globalThis, { arena, keyboard = true, pointer = true, onPause } = {}) {
  const held = new Set();
  let firing = false;
  let focusKey = false;
  let focusHold = false;
  let reload = false;
  let aimPoint = null;
  const sticks = { move: null, aim: null };
  const pointers = new Map();

  const boxOf = () => {
    const rect = target.getBoundingClientRect?.();
    if (!rect || !arena) return null;
    return { rect, box: viewBox(rect.width, rect.height, arena.cols, arena.rows) };
  };

  const worldAt = (event) => {
    const found = boxOf();
    if (!found) return null;
    return toWorld(found.box, event.clientX - found.rect.left, event.clientY - found.rect.top);
  };

  const stickVector = (stick) =>
    stick ? normalize((stick.x - stick.baseX) / STICK_RADIUS, (stick.y - stick.baseY) / STICK_RADIUS) : { x: 0, y: 0, mag: 0 };

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse') {
      if (event.button === 2) focusHold = true;
      else firing = true;
      aimPoint = worldAt(event) ?? aimPoint;
      return;
    }
    const found = boxOf();
    if (!found) return;
    const localX = event.clientX - found.rect.left;
    const side = localX < found.rect.width / 2 ? 'move' : 'aim';
    if (sticks[side]) return;
    const stick = {
      id: event.pointerId ?? 0,
      side,
      baseX: event.clientX,
      baseY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
    sticks[side] = stick;
    pointers.set(stick.id, stick);
  };

  const onPointerMove = (event) => {
    if (event.pointerType === 'mouse') {
      aimPoint = worldAt(event) ?? aimPoint;
      return;
    }
    const stick = pointers.get(event.pointerId ?? 0);
    if (!stick) return;
    stick.x = event.clientX;
    stick.y = event.clientY;
    // 推到圆外就把基准跟着拖过去，手指不会「用光」摇杆行程。
    const dx = stick.x - stick.baseX;
    const dy = stick.y - stick.baseY;
    const mag = Math.hypot(dx, dy);
    if (mag > STICK_RADIUS) {
      stick.baseX = stick.x - (dx / mag) * STICK_RADIUS;
      stick.baseY = stick.y - (dy / mag) * STICK_RADIUS;
    }
  };

  const onPointerUp = (event) => {
    if (event.pointerType === 'mouse') {
      if (event.button === 2) focusHold = false;
      else firing = false;
      return;
    }
    const stick = pointers.get(event.pointerId ?? 0);
    if (!stick) return;
    pointers.delete(stick.id);
    sticks[stick.side] = null;
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (RELOAD_KEYS.has(event.code)) {
      if (!event.repeat) reload = true;
      return;
    }
    if (FOCUS_KEYS.has(event.code)) {
      focusKey = true;
      return;
    }
    if (FIRE_KEYS.has(event.code)) {
      firing = true;
    } else if (!MOVE_KEYS[event.code]) {
      return;
    } else {
      held.add(event.code);
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };

  const onKeyUp = (event) => {
    if (FOCUS_KEYS.has(event.code)) focusKey = false;
    else if (FIRE_KEYS.has(event.code)) firing = false;
    else held.delete(event.code);
  };

  const onBlur = () => {
    held.clear();
    firing = false;
    focusKey = false;
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['keyup', onKeyUp, keyboard],
    ['blur', onBlur, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
    ['contextmenu', (event) => event.preventDefault?.(), pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    // HUD 上的按钮直接改这两个状态，触屏也能端稳和换弹。
    setFocus(value) {
      focusHold = Boolean(value);
    },
    pressReload() {
      reload = true;
    },
    sticks: () => ({
      move: sticks.move ? { ...sticks.move, ...stickVector(sticks.move) } : null,
      aim: sticks.aim ? { ...sticks.aim, ...stickVector(sticks.aim) } : null,
    }),
    snapshot() {
      let move = { x: 0, y: 0 };
      for (const code of held) {
        const dir = MOVE_KEYS[code];
        move = { x: move.x + dir.x, y: move.y + dir.y };
      }
      const keyMove = normalize(move.x, move.y);
      const stickMove = stickVector(sticks.move);
      const merged = stickMove.mag > STICK_DEAD ? stickMove : keyMove;
      const aimStick = stickVector(sticks.aim);
      const frame = {
        move: { x: merged.x, y: merged.y },
        aimAngle: aimStick.mag > STICK_DEAD ? Math.atan2(aimStick.y, aimStick.x) : null,
        aimPoint,
        fire: firing || aimStick.mag > FIRE_MAG,
        focus: focusKey || focusHold,
        reload,
      };
      reload = false;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const mergeInput = (a, b) => ({
  move: a.move.x || a.move.y ? a.move : b.move,
  aimAngle: a.aimAngle ?? b.aimAngle,
  aimPoint: a.aimPoint ?? b.aimPoint,
  fire: Boolean(a.fire || b.fire),
  focus: Boolean(a.focus || b.focus),
  reload: Boolean(a.reload || b.reload),
});
