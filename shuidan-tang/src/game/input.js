// 键盘、屏幕方向键、场地拖动，三种输入归一成同一份 {dir, bomb, struggle}。
//
// 两个和手机有关的决定：
// 1. 走位只认四向。格子游戏里斜着走没有意义，摇杆给的斜向一律折成**分量大的那一轴**，
//    否则贴着柱角时会来回抖，看起来像卡住。
// 2. 只有一个动作键：活着时是放水弹，被裹成水泡时是挣脱。
//    同一颗按钮承担两件事，是因为这两件事永远不会同时可用——
//    而且被困住时玩家的第一反应本来就是猛点那颗按钮。

const KEY_DIR = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

const KEY_BOMB = new Set(['Space', 'KeyJ', 'KeyK', 'Enter']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

const VECTOR = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** 拖动超过这么多像素才算方向。太小会把「点一下」误判成走位。 */
export const DEAD_ZONE = 14;

export const EMPTY_INPUT = { dir: { x: 0, y: 0 }, bomb: false, struggle: false };

/** 摇杆向量折成四向：谁的分量大听谁的，平手时按横向——横向巷子更常用。 */
export function resolveDir(dx, dy, dead = DEAD_ZONE) {
  if (Math.hypot(dx, dy) < dead) return { x: 0, y: 0 };
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx), y: 0 };
  return { x: 0, y: Math.sign(dy) };
}

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  // 后按的方向盖住先按的：两个方向键一起按时，手指最后落下的那个才是意图。
  const order = [];
  const buttons = new Set();
  const stick = { active: false, dx: 0, dy: 0 };
  let pendingBomb = false;
  let pointerId = null;
  let origin = { x: 0, y: 0 };

  const hold = (action, on) => {
    if (!(action in VECTOR)) return;
    if (on) {
      if (!buttons.has(action)) buttons.add(action);
      const at = order.indexOf(action);
      if (at >= 0) order.splice(at, 1);
      order.push(action);
    } else {
      buttons.delete(action);
      const at = order.indexOf(action);
      if (at >= 0) order.splice(at, 1);
    }
  };

  const press = (action) => {
    if (action === 'bomb') pendingBomb = true;
  };

  const clear = () => {
    order.length = 0;
    buttons.clear();
    stick.active = false;
    stick.dx = 0;
    stick.dy = 0;
    pointerId = null;
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (KEY_BOMB.has(event.code)) {
      if (event.code === 'Space' && typeof event.preventDefault === 'function') event.preventDefault();
      if (!event.repeat) press('bomb');
      return;
    }
    const action = KEY_DIR[event.code];
    if (!action || event.repeat) return;
    hold(action, true);
  };

  const onKeyUp = (event) => {
    const action = KEY_DIR[event.code];
    if (action) hold(action, false);
  };

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    origin = { x: event.clientX, y: event.clientY };
    stick.active = true;
    stick.dx = 0;
    stick.dy = 0;
  };

  const onPointerMove = (event) => {
    if ((event.pointerId ?? 0) !== pointerId) return;
    stick.dx = event.clientX - origin.x;
    stick.dy = event.clientY - origin.y;
    // 手指走远后把原点跟过去，这样一次按住可以连续改向，不用抬手重按。
    const span = Math.hypot(stick.dx, stick.dy);
    if (span > DEAD_ZONE * 3) {
      const keep = (DEAD_ZONE * 3) / span;
      origin = {
        x: event.clientX - stick.dx * keep,
        y: event.clientY - stick.dy * keep,
      };
      stick.dx *= keep;
      stick.dy *= keep;
    }
  };

  const onPointerUp = (event) => {
    if ((event.pointerId ?? 0) !== pointerId) return;
    pointerId = null;
    stick.active = false;
    stick.dx = 0;
    stick.dy = 0;
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['keyup', onKeyUp, keyboard],
    ['blur', clear, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    press,
    hold,
    stick,
    snapshot() {
      const pad = order.length ? VECTOR[order[order.length - 1]] : null;
      const dir = pad ?? resolveDir(stick.dx, stick.dy);
      const bomb = pendingBomb;
      pendingBomb = false;
      // 放弹和挣脱是同一颗按钮：活着时放弹，被困住时挣脱。
      return { dir: { x: dir.x, y: dir.y }, bomb, struggle: bomb };
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
      clear();
    },
  };
}

/** 键盘和触屏可能同时在用（模拟器、带键盘的平板），两边取并集。 */
export const mergeInput = (a, b) => ({
  dir: a.dir.x || a.dir.y ? a.dir : b.dir,
  bomb: a.bomb || b.bomb,
  struggle: a.struggle || b.struggle,
});
