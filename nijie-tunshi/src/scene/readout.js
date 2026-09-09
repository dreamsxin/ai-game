import { canCrossObstacle, canPassGate } from '../game/rules.js';

// 渲染层的纯派生逻辑。createScene 需要 DOM 与 WebGL，无法进入自动化测试，
// 因此把"由权威状态算出标签与材质目标"这部分抽出来单独覆盖，
// 让渲染层只剩下无法测试的 three 调用。

export const AVAILABLE_COLOR = '#fff1a8';
export const UNAVAILABLE_COLOR = '#7b5a68';
export const DARK_POLARITY_COLOR = '#ff8bdc';
export const LIGHT_POLARITY_COLOR = '#ffe36e';
export const LIGHT_POLARITY_DIM = '#9a7651';

export const labelColor = (available) => (available ? AVAILABLE_COLOR : UNAVAILABLE_COLOR);

// 糖果怪质量标签：暗极性显示负号、亮极性显示正号，中性只显示数字。
export function objectLabelState(object, available) {
  if (object.polarity === 'dark') {
    return { text: `-${Math.round(object.mass)}`, color: DARK_POLARITY_COLOR };
  }
  if (object.polarity === 'light') {
    return {
      text: `+${Math.round(object.mass)}`,
      color: available ? LIGHT_POLARITY_COLOR : LIGHT_POLARITY_DIM,
    };
  }
  return { text: String(Math.round(object.mass)), color: labelColor(available) };
}

// 障碍高度标注：够高转暖色，不够保持暗灰。
export function obstacleLabelState(mass, obstacle) {
  const crossable = canCrossObstacle(mass, obstacle);
  return { text: `H${obstacle.height.toFixed(1)}`, color: labelColor(crossable), crossable };
}

export const GATE_OPEN_COLOR = 0x7df3ff;
export const GATE_OPEN_EMISSIVE = 0x58ffbf;
export const GATE_SHUT_COLOR = 0xff6e9f;
export const GATE_SHUT_EMISSIVE = 0xff62c7;
export const GATE_OPEN_OPACITY = 0.32;
export const GATE_SHUT_OPACITY = 0.85;

// 窄门读数：开着时是半透明青绿，关闭后转粉红并加深，让"永久关闭"一眼可见。
export function gateReadoutState(mass, gate) {
  const open = canPassGate(mass, gate);
  return {
    open,
    text: `≤${gate.maxMass}`,
    labelColor: labelColor(open),
    color: open ? GATE_OPEN_COLOR : GATE_SHUT_COLOR,
    emissive: open ? GATE_OPEN_EMISSIVE : GATE_SHUT_EMISSIVE,
    opacity: open ? GATE_OPEN_OPACITY : GATE_SHUT_OPACITY,
  };
}

// 情绪倾斜：pose.lean 是标量，需要绕"玩家方向"的垂直轴旋转才能读成前倾或后缩。
// rotation.y 已被自转占用，因此拆成 x / z 两个分量；最大倾角只有 8 度，
// 在这个幅度下 Euler 混合读起来就是干净的倾斜。
export function moodTilt(object, player, lean) {
  const dx = object.x - player.x;
  const dz = object.z - player.z;
  const distance = Math.hypot(dx, dz) || 1;
  return {
    rotationX: lean * (dz / distance),
    rotationZ: -lean * (dx / distance),
  };
}
