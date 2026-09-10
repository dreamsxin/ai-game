// 手势与按键归一化。这一层是纯的：只认屏幕像素和按键码，不知道棋盘长什么样。
// 屏幕坐标到格子的换算由渲染层负责（只有它知道相机矩阵），所以这里回调里给的是原始坐标。
//
// 与仓库里跑酷类游戏不同，这里是回合制，输入用回调即时派发而不是每帧快照：
// 一次滑动只应该推一格，攒到下一帧再消费反而会丢手势。
export const DRAG_THRESHOLD = 22;
export const TAP_MAX_MS = 300;
export const TAP_MAX_DRIFT = 14;

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyZ: 'undo',
  KeyR: 'restart',
  KeyH: 'hint',
  KeyQ: 'layerDown',
  KeyE: 'layerUp',
};

/** 取位移更大的轴，斜向滑动不会同时推行和推列。没过阈值返回 null。 */
export function resolveDrag(dx, dy, threshold = DRAG_THRESHOLD) {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { axis: 'x', sign: dx > 0 ? 1 : -1 };
  return { axis: 'y', sign: dy > 0 ? 1 : -1 };
}

export function createInput(target = globalThis, { onTap, onDrag, onPress, onRelease, onAction, keyboard = true, pointer = true } = {}) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let fired = false;

  const onKeyDown = (event) => {
    if (event.repeat) return;
    const action = KEY_ACTIONS[event.code];
    if (!action) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    onAction?.(action);
  };

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    startX = event.clientX;
    startY = event.clientY;
    startedAt = event.timeStamp ?? 0;
    fired = false;
    // 按下就先告诉上层手指落在哪：还没决定推哪个方向，但「碰到的是这一格」要立刻看得见。
    onPress?.({ x: startX, y: startY });
  };

  const onPointerMove = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId || fired) return;
    const drag = resolveDrag(event.clientX - startX, event.clientY - startY);
    if (!drag) return;
    // 推移用起手位置定位受影响的行列，中途手指飘走也不会推错一条。
    onDrag?.({ x: startX, y: startY, ...drag });
    fired = true;
  };

  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    const held = (event.timeStamp ?? 0) - startedAt;
    if (!fired && held <= TAP_MAX_MS && dx <= TAP_MAX_DRIFT && dy <= TAP_MAX_DRIFT) {
      onTap?.({ x: event.clientX, y: event.clientY });
    }
    pointerId = null;
    fired = false;
    onRelease?.();
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
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const keyAction = (code) => KEY_ACTIONS[code] ?? null;
