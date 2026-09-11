// HUD 文案与仪表快照。渲染层只读这里算出来的普通对象，不碰模拟状态。
import { MATERIALS, STATUS_LABELS } from '../game/rules.js';
import { GEAR_MODES, gearModeOf, gearRatio } from '../game/powertrain.js';
import { cargoTypeOf } from '../game/cargo.js';
import { distanceLeft } from '../game/simulation.js';
import { materialAt } from '../game/terrain.js';

export const TUTORIAL_STEPS = [
  { title: '先挂挡 ', detail: '1 倒挡 / 2 空挡 / 3 自动 / 4 低速 / 5 爬行。泥地里用低速和爬行挡。' },
  { title: '油门要点着给 ', detail: 'W 加速 S 刹车。轮子一空转就没有推力了，把打滑读数压在半格以下。' },
  { title: '陷了就锁差速 ', detail: 'G 锁差速把扭矩强行分给两侧，F 切换四驱。爬行挡自带差速锁。' },
  { title: '绞盘是正经操作 ', detail: 'E 挂钩到附近的树或石头，按住 Q 收线把车拽出来。' },
  { title: '货比车厢多 ', detail: 'C 在货场装货、在交付点卸货，都得先停稳。装不完就跑第二趟。' },
  { title: '实在出不来就叫拖车 ', detail: 'T 把车拖回路线，代价是 60 秒计时惩罚。' },
];

const pad = (value) => String(Math.floor(value)).padStart(2, '0');

/** 计时显示成 分:秒。惩罚时间算进去，玩家才知道叫拖车的真实代价。 */
export const timeLabel = (seconds) => `${pad(seconds / 60)}:${pad(seconds % 60)}`;

export const speedLabel = (metersPerSecond) => `${Math.round(Math.abs(metersPerSecond) * 3.6)}`;
export const rpmLabel = (rpm) => `${Math.round(rpm / 10) * 10}`;
export const fuelLabel = (litres) => `${Math.max(0, Math.round(litres))} L`;
export const percentLabel = (fraction) => `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
export const distanceLabel = (metres) => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`);

/** 挡位显示。自动挡额外标出当前是第几档，玩家才看得懂为什么突然没劲。 */
export function gearLabel(gear, autoIndex) {
  const mode = gearModeOf(gear);
  return mode.auto ? `${mode.short}${autoIndex + 1}` : mode.short;
}

export const gearName = (gear) => gearModeOf(gear).name;
export const gearOptions = () => GEAR_MODES.map((mode) => ({ id: mode.id, short: mode.short, name: mode.name }));
export const materialName = (index) => (MATERIALS[index] ?? MATERIALS[2]).name;
export const statusLabel = (status) => STATUS_LABELS[status] ?? status;
export const cargoName = (type) => cargoTypeOf(type).name;

/** 车损文案：分档比百分比更有用，玩家关心的是「还能不能开」。 */
export function damageLabel(damage) {
  if (damage < 0.15) return '车况良好';
  if (damage < 0.4) return '有些磕碰';
  if (damage < 0.7) return '伤得不轻';
  if (damage < 0.9) return '快撑不住了';
  return '随时报废';
}

/** 一句话教练。按当前最要紧的问题挑，不堆叠。 */
export function coachLine(state) {
  const { vehicle, winch } = state;
  if (state.status === 'ready') return '挂上挡（3 自动挡）再给油';
  if (vehicle.gear === 'N') return '还在空挡';
  if (state.fuel <= 0) return '没油了，按 T 叫拖车';
  if (vehicle.submerged > state.spec.snorkel * 0.8) return '水太深，排气管快进水了';
  if (winch.anchor && winch.tension > 0) return '正在收线，别松油门';
  if (state.stuck && !winch.anchor) return '陷住了，按 E 挂绞盘';
  if (state.stuck) return '按住 Q 收线';
  if (vehicle.slipping > 0.7 && vehicle.speed < 2) return '轮子在空转，松点油门';
  if (vehicle.tilt > 0.7) return '车身歪得厉害，慢下来';
  if (vehicle.avgSink > 0.22) return '陷进泥里了，换爬行挡';
  if (state.cargo.length === 0 && state.pending > 0) return '回货场装货';
  if (state.cargo.length > 0) return '开到交付点，停稳后按 C 卸货';
  return null;
}

export const effectMessage = (effects) => (effects.length > 0 ? effects[effects.length - 1] : null);

/** 结算评语。 */
export function winComment(seconds, par) {
  if (seconds <= par * 0.7) return '一趟都没陷，路况被你吃透了';
  if (seconds <= par) return '干净利落，货和车都全须全尾';
  if (seconds <= par * 1.45) return '磨了点时间，但东西送到了';
  return '路是烂的，人是硬的';
}

export const starLabel = (stars) => '★★★'.slice(0, stars).padEnd(3, '☆');

/**
 * 每帧给 HUD 的仪表快照。全是原始数字和短字符串，React 拿去直接渲染。
 * 这里现算而不是缓存：算一次的成本远小于把它塞进模拟状态带来的耦合。
 */
export function readout(state) {
  const { vehicle, spec, level } = state;
  const ratio = gearRatio(vehicle.gear, vehicle.autoIndex);
  return {
    status: state.status,
    statusText: statusLabel(state.status),
    time: timeLabel(state.elapsed),
    penalty: state.penalty,
    par: timeLabel(level.par),
    overPar: state.elapsed + state.penalty > level.par,
    speed: speedLabel(vehicle.forwardSpeed),
    reversing: vehicle.forwardSpeed < -0.4,
    rpm: rpmLabel(vehicle.rpm),
    rpmFraction: Math.min(1, vehicle.rpm / spec.engine.max),
    gear: gearLabel(vehicle.gear, vehicle.autoIndex),
    gearId: vehicle.gear,
    gearName: gearName(vehicle.gear),
    inGear: ratio > 0,
    awd: vehicle.awd,
    diffLock: vehicle.diffLock || vehicle.gear === 'LL',
    fuel: fuelLabel(state.fuel),
    fuelFraction: state.fuel / state.maxFuel,
    damage: state.damage,
    damageText: damageLabel(state.damage),
    slip: vehicle.slipping,
    sink: Math.min(1, vehicle.avgSink / 0.5),
    tilt: vehicle.tilt,
    ground: materialName(materialAt(level.terrain, vehicle.position.x, vehicle.position.z)),
    submerged: vehicle.submerged,
    drown: Math.min(1, vehicle.submerged / spec.snorkel),
    cargo: state.cargo.length,
    slots: spec.slots,
    pending: state.pending,
    delivered: state.delivered,
    required: state.required,
    cargoName: cargoName(level.cargo.type),
    remaining: distanceLabel(distanceLeft(state)),
    winched: Boolean(state.winch.anchor),
    winchTension: state.winch.anchor ? Math.min(1, state.winch.tension / 92000) : 0,
    stuck: state.stuck,
    coach: coachLine(state),
    stars: state.stars,
  };
}
