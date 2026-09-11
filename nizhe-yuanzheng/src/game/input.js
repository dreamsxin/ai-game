// 输入归一化。开车是连续量，所以这一层跟仓库里回合制游戏不同：
// 按住的键攒成每帧读一次的快照（油门、刹车、方向、手刹、收线），
// 一次性的操作（换挡、锁差速、挂钩、装卸）走 onAction 回调。
export const HOLD_KEYS = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  KeyQ: 'winch',
};

export const ACTION_KEYS = {
  Digit1: 'gearR',
  Digit2: 'gearN',
  Digit3: 'gearA',
  Digit4: 'gearL',
  Digit5: 'gearLL',
  Comma: 'gearDown',
  Period: 'gearUp',
  KeyE: 'winchToggle',
  KeyF: 'awd',
  KeyG: 'diffLock',
  KeyC: 'cargo',
  KeyV: 'refuel',
  KeyT: 'recover',
  KeyB: 'camera',
  KeyR: 'restart',
  KeyH: 'help',
};

export const holdAction = (code) => HOLD_KEYS[code] ?? null;
export const keyAction = (code) => ACTION_KEYS[code] ?? null;

// 方向键是开关量，但转向需要模拟量的手感：按住时线性推到底，松开回中。
export const STEER_RATE = 3.2;
export const STEER_RETURN = 5.6;

const EMPTY = { throttle: 0, brake: 0, steer: 0, handbrake: false, winch: false };

/** 把按键集合和触屏状态合成一份控制量。触屏优先，两边都有就取绝对值大的。 */
export function mergeControls(held, touch = EMPTY, steer = 0) {
  const keyBrake = held.has('brake') ? 1 : 0;
  const throttle = Math.max(held.has('throttle') ? 1 : 0, touch.throttle ?? 0);
  const brake = Math.max(keyBrake, touch.brake ?? 0);
  const touchSteer = touch.steer ?? 0;
  return {
    throttle,
    brake,
    steer: Math.abs(touchSteer) > Math.abs(steer) ? touchSteer : steer,
    handbrake: held.has('handbrake') || Boolean(touch.handbrake),
    winch: held.has('winch') || Boolean(touch.winch),
  };
}

/** 键盘转向的一阶跟随。松手回中比压方向快，免得车老是斜着走。 */
export function advanceSteer(current, held, dt) {
  const want = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  if (want === 0) {
    const decay = STEER_RETURN * dt;
    if (Math.abs(current) <= decay) return 0;
    return current - Math.sign(current) * decay;
  }
  const next = current + want * STEER_RATE * dt;
  return Math.max(-1, Math.min(1, next));
}

/**
 * 挂上键盘监听。返回的 axes(dt, touch) 每帧调一次，读到的就是当前控制量。
 * held 是 Set，暴露出来主要是为了测试能直接检查。
 */
export function createInput(target = globalThis, { onAction, onHoldChange } = {}) {
  const held = new Set();
  let steer = 0;

  const onKeyDown = (event) => {
    const hold = holdAction(event.code);
    if (hold) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (!held.has(hold)) {
        held.add(hold);
        onHoldChange?.(hold, true);
      }
      return;
    }
    if (event.repeat) return;
    const action = keyAction(event.code);
    if (!action) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    onAction?.(action);
  };

  const onKeyUp = (event) => {
    const hold = holdAction(event.code);
    if (!hold) return;
    held.delete(hold);
    onHoldChange?.(hold, false);
  };

  // 切到别的标签页时松开所有键，回来时车不会还在焖着油门。
  const onBlur = () => held.clear();

  const listeners = [
    ['keydown', onKeyDown],
    ['keyup', onKeyUp],
    ['blur', onBlur],
  ];
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    held,
    axes(dt, touch = EMPTY) {
      steer = advanceSteer(steer, held, dt);
      return mergeControls(held, touch, steer);
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
      held.clear();
    },
  };
}
