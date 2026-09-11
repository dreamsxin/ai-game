// 绞盘。硬核越野里它不是外挂而是基本操作：陷住了就挂钩、收线、把自己拽出来。
// 钢缆只能拉不能推，收线很慢，而且拉力方向就是锚点方向——挂错树会把车横过来。
import { WINCH_DAMPING, WINCH_FORCE, WINCH_RANGE, WINCH_SPEED, WINCH_STIFFNESS } from './rules.js';
import { add, clamp, dot, length, normalize, rotate, scale, sub } from './vec.js';

export const createWinch = () => ({ anchor: null, propIndex: -1, length: 0, pulling: false, tension: 0 });

/** 绞盘挂点在前保险杠中央（车身坐标）。 */
export const winchMount = (spec) => ({ x: 0, y: spec.comY * 0.2, z: -spec.body.length * 0.46 });

export const winchOrigin = (spec, position, quaternion) => add(position, rotate(quaternion, winchMount(spec)));

/** 射程内最近的可挂锚点。返回索引和坐标，找不到返回 null。 */
export function findAnchor(props, origin, range = WINCH_RANGE) {
  let best = null;
  for (let index = 0; index < props.length; index += 1) {
    const prop = props[index];
    if (!prop.anchor) continue;
    const distance = Math.hypot(prop.x - origin.x, prop.z - origin.z);
    if (distance > range) continue;
    if (best && distance >= best.distance) continue;
    // 挂钩高度取树干下半段：拉力略微朝下，不会把车头掀起来。
    best = { index, distance, point: { x: prop.x, y: prop.y + Math.min(1.6, prop.height * 0.35), z: prop.z } };
  }
  return best;
}

/** 挂钩。初始缆长取挂点到锚点的真实三维距离，所以挂上的瞬间没有拉力。
 *  射程判定用的是水平距离（「那棵树够不够近」），两者不能混用，
 *  否则挂钩瞬间就会凭空多出几百牛的张力把车拽一下。 */
export function attach(winch, props, origin, range = WINCH_RANGE) {
  const found = findAnchor(props, origin, range);
  if (!found) return { winch, attached: false };
  const span = length(sub(found.point, origin));
  return {
    winch: { anchor: found.point, propIndex: found.index, length: Math.max(1.5, span), pulling: false, tension: 0 },
    attached: true,
  };
}

export const detach = () => createWinch();

/** 收线。只在按住收线键时缩短缆长，松开就停在当前长度。 */
export function reel(winch, pulling, dt) {
  if (!winch.anchor) return winch;
  if (!pulling) return winch.pulling ? { ...winch, pulling: false } : winch;
  return { ...winch, pulling: true, length: Math.max(1.2, winch.length - WINCH_SPEED * dt) };
}

/**
 * 钢缆张力。缆长被拉超才有力，方向指向锚点，大小是弹簧 + 阻尼并夹在额定拉力内。
 * pointVelocity 是挂点的世界速度，用来加阻尼，否则车会被缆绳弹起来。
 */
export function winchTension(winch, origin, pointVelocity) {
  if (!winch.anchor) return { force: { x: 0, y: 0, z: 0 }, tension: 0, distance: 0 };
  const delta = sub(winch.anchor, origin);
  const distance = length(delta);
  const over = distance - winch.length;
  if (over <= 0) return { force: { x: 0, y: 0, z: 0 }, tension: 0, distance };
  const direction = normalize(delta);
  // 挂点正在远离锚点时阻尼才出力，否则回弹阶段会被反向加速。
  const closing = -dot(pointVelocity, direction);
  const magnitude = clamp(WINCH_STIFFNESS * over + WINCH_DAMPING * Math.max(0, closing), 0, WINCH_FORCE);
  return { force: scale(direction, magnitude), tension: magnitude, distance };
}

/** 缆绳绷太长会断：超出额定长度太多就自动脱钩，免得把车甩飞。 */
export const cableSnapped = (winch, distance) => Boolean(winch.anchor) && distance > winch.length + 6;
