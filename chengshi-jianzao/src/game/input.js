// 手势与按键归一化。这一层是纯的：只认屏幕像素和按键码，不知道城市长什么样。
// 屏幕坐标到格子的换算由渲染层负责（只有它知道相机矩阵），所以回调里给的是原始坐标。
//
// 建造类游戏最要紧的手感是「按住拖一条街」：所以按下和移动都要往外派发格子，
// 由上层做同格去重，而不是等抬手才结算。
export const HOVER_THROTTLE_PX = 4;

const KEY_ACTIONS = {
  Digit1: 'tool:road',
  Digit2: 'tool:house',
  Digit3: 'tool:shop',
  Digit4: 'tool:factory',
  Digit5: 'tool:power',
  Digit6: 'tool:park',
  KeyB: 'tool:bulldoze',
  Comma: 'prevTool',
  Period: 'nextTool',
  Space: 'pause',
  KeyR: 'restart',
  KeyQ: 'rotateLeft',
  KeyE: 'rotateRight',
  BracketRight: 'faster',
  BracketLeft: 'slower',
  Equal: 'zoomIn',
  Minus: 'zoomOut',
};

export const keyAction = (code) => KEY_ACTIONS[code] ?? null;

export function createInput(target = globalThis, {
  onPaintStart,
  onPaintMove,
  onPaintEnd,
  onHover,
  onAction,
  keyboard = true,
  pointer = true,
} = {}) {
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

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
    lastX = event.clientX;
    lastY = event.clientY;
    onPaintStart?.({ x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event) => {
    // 没按下的时候只更新预览框，鼠标玩家靠它确认落点。
    if (pointerId === null) {
      if (Math.abs(event.clientX - lastX) < HOVER_THROTTLE_PX
        && Math.abs(event.clientY - lastY) < HOVER_THROTTLE_PX) return;
      lastX = event.clientX;
      lastY = event.clientY;
      onHover?.({ x: event.clientX, y: event.clientY });
      return;
    }
    if ((event.pointerId ?? 0) !== pointerId) return;
    lastX = event.clientX;
    lastY = event.clientY;
    onPaintMove?.({ x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    pointerId = null;
    onPaintEnd?.();
  };

  const onPointerLeave = () => {
    if (pointerId !== null) return;
    onHover?.(null);
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
    ['pointerleave', onPointerLeave, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}
