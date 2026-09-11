// 键盘与触摸滑动都归一成同一份一次性输入，模拟层每步消费一次。
export const SWIPE_THRESHOLD = 28;
export const TAP_MAX_MS = 260;
export const TAP_MAX_DRIFT = 18;

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  const pending = { left: false, right: false, jump: false, slide: false };
  const press = (action) => {
    if (action in pending) pending[action] = true;
  };

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let fired = false;

  const onKeyDown = (event) => {
    if (event.repeat) return;
    if (PAUSE_KEYS.has(event.code)) {
      onPause?.();
      return;
    }
    const action = KEY_ACTIONS[event.code];
    if (!action) return;
    if (event.code === 'Space' && typeof event.preventDefault === 'function') event.preventDefault();
    press(action);
  };

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    startX = event.clientX;
    startY = event.clientY;
    startedAt = event.timeStamp ?? 0;
    fired = false;
  };

  const onPointerMove = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId || fired) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    // 取位移更大的轴，斜向滑动不会同时触发变道和跳跃。
    if (Math.abs(dx) >= Math.abs(dy)) press(dx > 0 ? 'right' : 'left');
    else press(dy > 0 ? 'slide' : 'jump');
    fired = true;
  };

  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    const held = (event.timeStamp ?? 0) - startedAt;
    // 轻点等于跳跃，是手机上最直觉的主动作。
    if (!fired && held <= TAP_MAX_MS && dx <= TAP_MAX_DRIFT && dy <= TAP_MAX_DRIFT) press('jump');
    pointerId = null;
    fired = false;
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    press,
    snapshot() {
      const frame = { ...pending };
      pending.left = false;
      pending.right = false;
      pending.jump = false;
      pending.slide = false;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const mergeInput = (left, right) => ({
  left: left.left || right.left,
  right: left.right || right.right,
  jump: left.jump || right.jump,
  slide: left.slide || right.slide,
});


