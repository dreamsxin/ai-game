// 动力总成：扭矩曲线、分动箱挡位、差速器分配、油耗。
// 这一层不碰车身姿态，只回答「现在每个驱动轮上能有多少扭矩」。
import { FUEL_AWD_PENALTY, FUEL_IDLE_RATE, FUEL_LOAD_RATE } from './rules.js';
import { clamp, lerp } from './vec.js';

// 挡位是 SnowRunner 那套分动箱：自动挡跑路，低速挡爬坡，爬行挡专治陷车。
export const GEAR_MODES = [
  { id: 'R', name: '倒挡', short: 'R', ratio: 3.4, auto: false, forward: -1 },
  { id: 'N', name: '空挡', short: 'N', ratio: 0, auto: false, forward: 0 },
  { id: 'A', name: '自动挡', short: 'A', ratio: 0, auto: true, forward: 1 },
  { id: 'L', name: '低速挡', short: 'L', ratio: 2.35, auto: false, forward: 1 },
  { id: 'LL', name: '爬行挡', short: 'LL', ratio: 5.6, auto: false, forward: 1 },
];

export const AUTO_RATIOS = [3.9, 2.35, 1.5, 1];
// 换挡阈值。升挡点高、降挡点低，中间留一大段免得在坡上反复跳挡。
export const UPSHIFT_RPM = 0.82;
export const DOWNSHIFT_RPM = 0.42;
// 爬行挡强制锁差速：这是它存在的理由。
export const CRAWL_LOCKS_DIFF = true;

export const gearModeOf = (id) => GEAR_MODES.find((mode) => mode.id === id) ?? GEAR_MODES[1];
export const gearModeIndex = (id) => Math.max(0, GEAR_MODES.findIndex((mode) => mode.id === id));

/** 当前总变速比（不含主减速比）。空挡是 0，倒挡返回正值，方向由 forward 决定。 */
export function gearRatio(mode, autoIndex = 0) {
  const gear = gearModeOf(mode);
  if (gear.auto) return AUTO_RATIOS[clamp(autoIndex, 0, AUTO_RATIOS.length - 1)];
  return gear.ratio;
}

export const gearDirection = (mode) => gearModeOf(mode).forward;

/** 曲线之外线性外推会给出负扭矩，所以两端都夹住；断油区交给 revLimit 处理。 */
export function engineTorque(engine, rpm) {
  const curve = engine.curve;
  if (rpm <= curve[0].rpm) return curve[0].nm;
  for (let index = 1; index < curve.length; index += 1) {
    const prev = curve[index - 1];
    const next = curve[index];
    if (rpm <= next.rpm) {
      return lerp(prev.nm, next.nm, (rpm - prev.rpm) / (next.rpm - prev.rpm));
    }
  }
  return curve[curve.length - 1].nm;
}

/** 断油：超转之后扭矩迅速归零，不然爬行挡会把转速顶穿。 */
export function revLimit(engine, rpm) {
  if (rpm <= engine.max) return 1;
  return Math.max(0, 1 - (rpm - engine.max) / 220);
}

/** 驱动轮平均转速反推发动机转速。差速器本质是取平均，所以这里就是平均。 */
export function engineRpm(engine, wheelSpin, totalRatio) {
  if (totalRatio <= 0) return engine.idle;
  const rpm = (Math.abs(wheelSpin) * totalRatio * 60) / (Math.PI * 2);
  return clamp(rpm, engine.idle, engine.max + 260);
}

/** 自动挡换挡。只在自动挡下动，返回新的挡位序号。 */
export function autoShift(engine, autoIndex, rpm, throttle) {
  const ratio = rpm / engine.max;
  // 深踩油门时晚点升挡，把扭矩留在轮上。
  const up = UPSHIFT_RPM + throttle * 0.1;
  if (ratio > up && autoIndex < AUTO_RATIOS.length - 1) return autoIndex + 1;
  if (ratio < DOWNSHIFT_RPM && autoIndex > 0) return autoIndex - 1;
  return autoIndex;
}

/** 这一挡下发动机能送到全部驱动轮的总扭矩。 */
export function drivelineTorque(spec, mode, autoIndex, rpm, throttle) {
  const ratio = gearRatio(mode, autoIndex);
  if (ratio <= 0) return 0;
  const nm = engineTorque(spec.engine, rpm) * revLimit(spec.engine, rpm);
  return nm * ratio * spec.finalDrive * throttle * 0.92;
}

/** 该轮是否参与驱动。后桥恒接，前桥看四驱开关。 */
export const isDriven = (wheel, awd) => wheel.powered === 'rear' || (awd && wheel.powered === 'front');

/**
 * 把总扭矩分到各驱动轮。
 * 开放差速器：同一桥两个轮扭矩相等，且被抓地力弱的那个卡住——一只轮悬空整桥就白转。
 * 锁止差速器：各轮按自己的极限吃扭矩，这才是把车从泥里拽出来的办法。
 * capacity 是各轮的可传递扭矩上限（μ·Fz·r），由车辆层现算。
 */
export function distributeTorque(wheels, total, { awd, diffLock }) {
  const driven = wheels.map((wheel, index) => ({ wheel, index })).filter(({ wheel }) => isDriven(wheel, awd));
  const torques = wheels.map(() => 0);
  if (driven.length === 0 || total === 0) return torques;

  const axles = new Map();
  for (const entry of driven) {
    const list = axles.get(entry.wheel.axle) ?? [];
    list.push(entry);
    axles.set(entry.wheel.axle, list);
  }

  const share = total / axles.size;
  for (const list of axles.values()) {
    const nominal = share / list.length;
    if (diffLock) {
      // 锁止后每个轮自己扛。给一点越限余量，轮子才会真的空转打滑。
      for (const { wheel, index } of list) torques[index] = Math.min(nominal, wheel.capacity * 1.4);
      continue;
    }
    const weakest = Math.min(...list.map(({ wheel }) => wheel.capacity));
    for (const { index } of list) torques[index] = Math.min(nominal, weakest * 1.2);
  }
  return torques;
}

/** 油耗：怠速底噪 + 负荷项，四驱额外费油。 */
export function fuelBurn(engine, rpm, throttle, awd, dt) {
  const load = throttle * (rpm / engine.max);
  const rate = (FUEL_IDLE_RATE + FUEL_LOAD_RATE * load) * (awd ? FUEL_AWD_PENALTY : 1);
  return rate * dt;
}
