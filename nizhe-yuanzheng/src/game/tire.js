// 轮胎模型：滑移率、侧偏角、摩擦圆，以及泥里那套下陷与阻力。
// 全是纯函数，单元测试能逐条钉住，也是「油门要点着给」这条手感的来源。
import { BEARING, BULLDOZE_DRAG, SINK_DRAG, gripFromSink } from './rules.js';
import { clamp, sign } from './vec.js';

// μ-slip 曲线的峰值滑移与峰后残余。峰后会掉力，所以一脚焖油反而没有推力，
// 这是本作最重要的一条手感规则：泥里得把滑移压在峰值附近。
export const PEAK_SLIP = 0.16;
export const SLIP_TAIL = 0.62;
export const PEAK_ANGLE = 0.15;
export const ANGLE_TAIL = 0.7;

/** 归一化摩擦利用率：峰值前线性上升，峰值后线性衰减到 tail。 */
export function slipCurve(slip, peak = PEAK_SLIP, tail = SLIP_TAIL) {
  const magnitude = Math.abs(slip);
  if (magnitude <= peak) return magnitude / peak;
  const over = Math.min(1, (magnitude - peak) / (peak * 7));
  return 1 - (1 - tail) * over;
}

/** 纵向滑移率。分母加 1 避免零速除零，也让静止起步的滑移不会瞬间打满。 */
export const longitudinalSlip = (spin, radius, vLong) => {
  const surface = spin * radius;
  return (surface - vLong) / Math.max(1.2, Math.abs(vLong));
};

/** 侧偏角。低速时分母的常数项让原地打方向不会产生巨大侧向力。 */
export const slipAngleOf = (vLong, vLat) => Math.atan2(vLat, Math.abs(vLong) + 0.8);

/** 接地印迹面积（平方米）。宽胎大轮压强低，也就不容易陷。 */
export const contactArea = (radius, width) => width * radius * 0.55;

/**
 * 下陷深度。接地压强除以地面承载力，按这一格还能陷多深的余量取比例。
 * capacity 已经把车辙算进去了，所以同一处越压越深；但最深只到轮心略下方——
 * 车桥一坐到地面上就不会再往下走了，没有这条封顶，泥塘会变成无底洞。
 */
export function sinkDepth(load, radius, width, capacity, tireSink = 1) {
  if (capacity <= 0 || load <= 0) return 0;
  const pressure = load / contactArea(radius, width);
  const depth = capacity * clamp((pressure / BEARING) * tireSink, 0, 1);
  return Math.min(depth, radius * 0.8);
}

/**
 * 接地面上的纵向力与侧向力。
 * 两个方向先各自算摩擦利用率，再一起塞进摩擦圆——纵向要满就没有侧向，
 * 所以在泥里猛给油的同时打方向，车只会直着往前推。
 */
export function tireForces({ load, grip, slipRatio, slipAngle, radius, sink }) {
  if (load <= 0) return { fx: 0, fy: 0, mu: 0, saturation: 0 };
  const mu = gripFromSink(grip, sink, radius);
  const limit = mu * load;
  const useX = slipCurve(slipRatio) * sign(slipRatio);
  const useY = -slipCurve(slipAngle, PEAK_ANGLE, ANGLE_TAIL) * sign(slipAngle);
  const demand = Math.hypot(useX, useY);
  const scale = demand > 1 ? 1 / demand : 1;
  return {
    fx: useX * scale * limit,
    fy: useY * scale * limit,
    mu,
    saturation: Math.min(1, demand),
  };
}

/** 滚动阻力 + 推泥阻力。深度项让陷下去之后每一米都更费劲。 */
export function rollingDrag(load, roll, sink, radius) {
  const depth = sink / Math.max(0.05, radius);
  return load * (roll + SINK_DRAG * depth + BULLDOZE_DRAG * depth * depth);
}

/**
 * 这一帧该往地上压多少车辙。
 * 打滑的轮子挖得远比滚过去的快——原地烧胎是把自己埋进去最快的办法。
 * 挖掘速率封顶，否则一脚焖油两秒就能挖出一个无底洞。
 */
export function rutCut(load, slipRatio, sink, dt) {
  if (sink <= 0.01) return 0;
  const spinning = Math.min(1.6, Math.max(0, Math.abs(slipRatio) - PEAK_SLIP));
  const dig = 0.006 + 0.055 * spinning;
  return dig * (load / 20000) * dt;
}

/** 自由滚动的轮速：不驱动也不刹车时轮子就跟着地面走。 */
export const freeRollSpin = (vLong, radius) => vLong / Math.max(0.05, radius);

/**
 * 「空转比例」：轮面速度里有多少没转化成车速，0 是纯滚动，1 是原地烧胎。
 * 滑移率在低速时会被分母的常数项撑大，不能拿来判断陷车；这个量可以。
 */
export function spinWaste(spin, radius, vLong) {
  const surface = Math.abs(spin * radius);
  if (surface < 0.3) return 0;
  return clamp((surface - Math.abs(vLong)) / surface, 0, 1);
}
