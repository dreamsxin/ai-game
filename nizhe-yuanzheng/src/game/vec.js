// 三维向量与四元数的最小实现。刚体要真的会翻车，就绕不开完整姿态，
// 但模拟层不许引用 Three.js（否则确定性回放和 node:test 都没法做），所以这里自己算。
// 约定：向量是 { x, y, z } 普通对象，四元数是 { x, y, z, w }，y 轴朝上。
export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const clone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const lengthXZ = (a) => Math.hypot(a.x, a.z);

/** 零向量归一化会得到 NaN，这里退化成朝上，免得一处除零污染整帧姿态。 */
export function normalize(a) {
  const len = length(a);
  if (len < 1e-9) return { x: 0, y: 1, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/** 把向量投到以 normal 为法线的平面上，用来把车轮方向压回接地面。 */
export const project = (a, normal) => sub(a, scale(normal, dot(a, normal)));

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (value) => (value > 0 ? 1 : value < 0 ? -1 : 0);

/** 上限为 max 的软饱和，力和扭矩都靠它避免单帧数值炸掉。 */
export const clampMag = (value, max) => clamp(value, -max, max);

export const quat = (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w });

export function quatFromAxisAngle(axis, angle) {
  const unit = normalize(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return { x: unit.x * s, y: unit.y * s, z: unit.z * s, w: Math.cos(half) };
}

// 朝向角约定：forward = (sin yaw, 0, -cos yaw)。yaw=0 朝 -z，增大时向右转。
// 绕 +y 的正向旋转会把 -z 转向 -x，正好相反，所以这里取负角。
// yawOf 是它的逆运算，两者必须成对修改，否则车会朝着与航向差 90° 的方向开。
export const quatFromYaw = (yaw) => quatFromAxisAngle({ x: 0, y: 1, z: 0 }, -yaw);

export function quatMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatNormalize(q) {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len < 1e-9) return quat();
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export const quatConjugate = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** 用四元数旋转向量：v' = q * v * q⁻¹，展开成不建临时四元数的形式。 */
export function rotate(q, v) {
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/** 世界向量转回车身坐标。 */
export const unrotate = (q, v) => rotate(quatConjugate(q), v);

/** 一阶积分角速度。dt 很小，配合归一化足够稳，省掉指数映射。 */
export function quatIntegrate(q, omega, dt) {
  const half = dt * 0.5;
  const delta = {
    x: omega.x * half,
    y: omega.y * half,
    z: omega.z * half,
    w: 0,
  };
  const spun = quatMultiply(delta, q);
  return quatNormalize({ x: q.x + spun.x, y: q.y + spun.y, z: q.z + spun.z, w: q.w + spun.w });
}

/** 车身三轴：forward 取 -z，和 Three.js 里模型朝向一致。 */
export function basisOf(q) {
  return {
    right: rotate(q, { x: 1, y: 0, z: 0 }),
    up: rotate(q, { x: 0, y: 1, z: 0 }),
    forward: rotate(q, { x: 0, y: 0, z: -1 }),
  };
}

/** 车头在水平面上的朝向角，HUD 的罗盘和相机跟随都用它。 */
export function yawOf(q) {
  const forward = rotate(q, { x: 0, y: 0, z: -1 });
  return Math.atan2(forward.x, -forward.z);
}

/** 车身倾角（弧度），0 表示轮子朝下站得端正，π 表示彻底翻过去。 */
export const tiltOf = (q) => Math.acos(clamp(rotate(q, { x: 0, y: 1, z: 0 }).y, -1, 1));

/** 角度差归一到 (-π, π]，转向和相机插值都要它防止绕远路。 */
export function wrapAngle(angle) {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}
