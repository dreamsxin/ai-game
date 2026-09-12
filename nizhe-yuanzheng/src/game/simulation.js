// 顶层模拟：把地形、车辆、绞盘、货物和任务串成一局。
//
// 这一层刻意是「可变的」：刚体以 1/120 秒推进，一帧要跑好几个子步，
// 每步都造新对象会把 GC 压垮。所以 step() 原地修改 state 并返回同一个对象，
// HUD 由 readout.js 现算快照，渲染层只读不写。
import { ARRIVE_SPEED, FUEL_IDLE_RATE, MAX_SUBSTEPS, PHYS_STEP, resultStars } from './rules.js';
import { buildLevel, levelAt, remainingDistance } from './level.js';
import { heightAt } from './terrain.js';
import { truckOf } from './trucks.js';
import { createVehicle, restingY, stepVehicle } from './vehicle.js';
import { GEAR_MODES, fuelBurn, gearModeIndex } from './powertrain.js';
import { atSite, cargoTypeOf, loadOne, loadedMass, shedCargo, unloadOne } from './cargo.js';
import { attach, cableSnapped, createWinch, detach, reel, winchOrigin, winchTension } from './winch.js';
import { add, cross, quatFromYaw, scale, sub, vec } from './vec.js';

export const EMPTY_INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false, winch: false };
// 陷车判定：轮子在打滑但车没在动，持续这么久就提示该用绞盘了。
export const STUCK_SECONDS = 2.5;
export const RECOVER_PENALTY = 60;
export const ROLL_RESET_SECONDS = 4;

const push = (state, kind, text) => {
  state.effects.push({ kind, text, at: state.elapsed });
  if (state.effects.length > 6) state.effects.shift();
};

export function createGame(levelIndex = 0, seed = 1) {
  const level = buildLevel(levelIndex, seed);
  const spec = truckOf(level.truckId);
  const groundY = heightAt(level.terrain, level.start.x, level.start.z);
  const vehicle = createVehicle(spec, { ...level.start, y: restingY(spec, groundY) });
  vehicle.gear = 'N';
  return {
    levelIndex,
    seed,
    level,
    spec,
    vehicle,
    winch: createWinch(),
    cargo: [],
    pending: level.cargo.count,
    delivered: 0,
    required: level.cargo.count,
    fuel: spec.fuel,
    maxFuel: spec.fuel,
    damage: 0,
    status: 'ready',
    elapsed: 0,
    penalty: 0,
    tick: 0,
    distance: 0,
    dug: 0,
    stuckTimer: 0,
    rollTimer: 0,
    stuck: false,
    stars: 0,
    effects: [],
  };
}

/**
 * 重算总质量与重心抬升，装卸货之后必须调一次。
 * 重心往上走的同时要把车身位置抬同样多：车桥没动，动的是重心，
 * 不补这一下悬挂会瞬间被压到底，车会自己弹起来。
 */
function applyLoad(state) {
  const { mass, comLift } = loadedMass(state.spec, state.cargo);
  state.vehicle.position.y += comLift - state.vehicle.comLift;
  state.vehicle.mass = mass;
  state.vehicle.comLift = comLift;
}

/** 一个物理子步：绞盘出力 → 刚体推进 → 油耗与车损记账。 */
function substep(state, input, dt) {
  const { vehicle, spec, level } = state;
  state.winch = reel(state.winch, Boolean(input.winch), dt);

  const external = [];
  if (state.winch.anchor) {
    const origin = winchOrigin(spec, vehicle.position, vehicle.quaternion);
    const arm = sub(origin, vehicle.position);
    const pointVelocity = add(vehicle.velocity, cross(vehicle.angularVelocity, arm));
    const pull = winchTension(state.winch, origin, pointVelocity);
    if (cableSnapped(state.winch, pull.distance)) {
      // 崩断和手动脱钩在绞盘状态上看不出区别，可反馈层必须分得开：
      // 一个是「你判断错了」，一个是「你决定收工」。留一个标记让它们分道。
      state.winch = { ...detach(), snapped: true };
      push(state, 'winch', '钢缆崩断，脱钩了');

    } else if (pull.tension > 0) {
      external.push({ force: pull.force, point: origin });
      state.winch = { ...state.winch, tension: pull.tension };
    }
  }

  // 没油就只有怠速，油门给了也没用；淹缸由 vehicle 内部的 powerScale 处理。
  const dry = state.fuel <= 0;
  const controls = {
    throttle: dry ? 0 : input.throttle ?? 0,
    brake: input.brake ?? 0,
    steer: input.steer ?? 0,
    handbrake: Boolean(input.handbrake),
  };
  const before = { x: vehicle.position.x, z: vehicle.position.z };
  const report = stepVehicle(vehicle, level, controls, dt, external);

  state.distance += Math.hypot(vehicle.position.x - before.x, vehicle.position.z - before.z);
  state.dug += report.dug;
  state.damage = Math.min(1, state.damage + report.damage);
  if (!dry) {
    state.fuel = Math.max(0, state.fuel - fuelBurn(spec.engine, vehicle.rpm, report.throttle, vehicle.awd, dt));
  }
  if (report.damage > 0 && state.cargo.length > 0 && report.impact > 14) {
    const shed = shedCargo(state.cargo, 1);
    state.cargo = shed.cargo;
    if (shed.lost > 0) {
      applyLoad(state);
      push(state, 'cargo', '一件货被震下车了');
    }
  }
}

/**
 * 推进一帧。dt 是真实帧间隔，内部切成不超过 MAX_SUBSTEPS 个固定子步；
 * 掉帧时宁可让模拟走慢一点，也不让弹簧因为大步长炸掉。
 */
export function step(state, input = EMPTY_INPUT, dt = 1 / 60) {
  if (state.status === 'won' || state.status === 'lost') return state;

  const clamped = Math.min(dt, MAX_SUBSTEPS * PHYS_STEP);
  const count = Math.max(1, Math.ceil(clamped / PHYS_STEP));
  const h = clamped / count;
  for (let index = 0; index < count; index += 1) substep(state, input, h);

  // 计时从玩家真正动手那一刻开始：挂上挡或者踩了踏板。
  // 物理照样在跑（车得先在弹簧上坐稳），只是秒表还没启动。
  const touched = (input.throttle ?? 0) > 0 || (input.brake ?? 0) > 0 || state.vehicle.gear !== 'N';
  if (state.status === 'ready' && touched) state.status = 'driving';
  if (state.status === 'driving') {
    state.elapsed += clamped;
    state.tick += 1;
  }

  const { vehicle } = state;
  // 陷车的定义是「轮子在转，车没在走」，不是「车速低」——
  // 爬行挡本来就慢，拿绝对车速判会把正常爬坡也算成陷车。
  const struggling = vehicle.slipping > 0.7 && vehicle.speed < 1;
  state.stuckTimer = struggling ? state.stuckTimer + clamped : 0;
  const wasStuck = state.stuck;
  state.stuck = state.stuckTimer > STUCK_SECONDS;
  if (state.stuck && !wasStuck) {
    push(state, 'stuck', vehicle.diffLock ? '陷住了，挂绞盘往前拽' : '陷住了，先锁差速再点油门');
  }

  state.rollTimer = vehicle.rolled ? state.rollTimer + clamped : 0;
  if (state.rollTimer > ROLL_RESET_SECONDS && state.cargo.length > 0) {
    const shed = shedCargo(state.cargo, state.cargo.length);
    state.cargo = shed.cargo;
    applyLoad(state);
    push(state, 'cargo', '车翻了，货全撒了');
  }

  if (state.damage >= 1) {
    state.status = 'lost';
    push(state, 'lost', '车报废了');
    return state;
  }
  if (state.delivered >= state.required) {
    state.status = 'won';
    state.stars = resultStars(state.elapsed + state.penalty, state.level.par);
  }
  return state;
}

// —— 离散操作。都原地改 state 并返回它，方便在 ref 里连着调。——

export function setGear(state, gearId) {
  if (!GEAR_MODES.some((mode) => mode.id === gearId)) return state;
  // 换到反向挡之前得基本停住，不然等于用变速箱当刹车。
  const reversing = gearId === 'R';
  const moving = Math.abs(state.vehicle.forwardSpeed) > 1.4;
  if (moving && (reversing || (state.vehicle.gear === 'R' && gearId !== 'N'))) {
    push(state, 'gear', '先停稳再换向');
    return state;
  }
  state.vehicle.gear = gearId;
  state.vehicle.autoIndex = 0;
  return state;
}

export const shiftGear = (state, delta) =>
  setGear(state, GEAR_MODES[Math.min(GEAR_MODES.length - 1, Math.max(0, gearModeIndex(state.vehicle.gear) + delta))].id);

export function toggleAwd(state) {
  state.vehicle.awd = !state.vehicle.awd;
  push(state, 'drive', state.vehicle.awd ? '四驱接入' : '四驱断开');
  return state;
}

export function toggleDiffLock(state) {
  state.vehicle.diffLock = !state.vehicle.diffLock;
  push(state, 'drive', state.vehicle.diffLock ? '差速锁锁上' : '差速锁松开');
  return state;
}

/** 挂钩 / 脱钩。同一个键来回切，挂不上会明确说为什么。 */
export function toggleWinch(state) {
  if (state.winch.anchor) {
    state.winch = detach();
    push(state, 'winch', '脱钩');
    return state;
  }
  const origin = winchOrigin(state.spec, state.vehicle.position, state.vehicle.quaternion);
  const result = attach(state.winch, state.level.props, origin);
  state.winch = result.winch;
  push(state, 'winch', result.attached ? '挂上了，按住收线' : '附近没有能挂钩的树或石头');
  return state;
}

/** 一个键管装卸：在货场装一件，在交付点卸一件。都得停稳。 */
export function handleCargo(state) {
  const { vehicle, level } = state;
  const stopped = vehicle.speed <= ARRIVE_SPEED;
  if (atSite(level.site, vehicle.position, vehicle.speed) && state.cargo.length > 0) {
    const result = unloadOne(state.cargo);
    state.cargo = result.cargo;
    state.delivered += 1;
    applyLoad(state);
    push(state, 'cargo', `交付 ${state.delivered}/${state.required} 件`);
    return state;
  }
  if (atSite(level.depot, vehicle.position, vehicle.speed)) {
    const result = loadOne(state.cargo, state.spec, state.pending > 0 ? level.cargo : 0);
    if (!result.loaded) {
      push(state, 'cargo', result.reason);
      return state;
    }
    state.cargo = result.cargo;
    state.pending -= 1;
    applyLoad(state);
    push(state, 'cargo', `装上一件${cargoTypeOf(level.cargo.type).name}`);
    return state;
  }
  push(state, 'cargo', stopped ? '这里不是货场也不是交付点' : '得先停稳');
  return state;
}

/** 加油点补满。没到点就只提示。 */
export function refuel(state) {
  const spot = state.level.refuel.find((point) => atSite(point, state.vehicle.position, state.vehicle.speed));
  if (!spot) {
    push(state, 'fuel', '附近没有油料点');
    return state;
  }
  state.fuel = state.maxFuel;
  push(state, 'fuel', '加满了');
  return state;
}

/**
 * 拖车救援。翻了、没油了、或者绞盘也拽不动的时候用它把车放回路线上，
 * 代价是 60 秒计时惩罚和一次修车——比让玩家卡死在泥里体面得多。
 */
export function recover(state) {
  const { vehicle, level } = state;
  let best = level.route[0];
  let bestDistance = Infinity;
  for (const point of level.route) {
    const distance = Math.hypot(point.x - vehicle.position.x, point.z - vehicle.position.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  const groundY = heightAt(level.terrain, best.x, best.z);
  vehicle.position = vec(best.x, restingY(state.spec, groundY) + 0.15, best.z);
  vehicle.quaternion = quatFromYaw(Math.atan2(level.site.x - best.x, -(level.site.z - best.z)));
  vehicle.velocity = vec();
  vehicle.angularVelocity = vec();
  for (const wheel of vehicle.wheels) wheel.spin = 0;
  vehicle.gear = 'N';
  state.winch = detach();
  state.fuel = Math.max(state.fuel, state.maxFuel * 0.25);
  state.damage = Math.max(0, state.damage - 0.3);
  state.penalty += RECOVER_PENALTY;
  state.stuckTimer = 0;
  state.stuck = false;
  push(state, 'recover', `拖回路线，计时 +${RECOVER_PENALTY} 秒`);
  return state;
}

export const restartLevel = (state) => createGame(state.levelIndex, state.seed);
export const reroll = (state, seed) => createGame(state.levelIndex, seed);
export const nextLevel = (state, seed) => createGame(state.levelIndex + 1, seed ?? state.seed);

/** HUD 用的「还有多远」。 */
export const distanceLeft = (state) => remainingDistance(state.level, state.vehicle.position.x, state.vehicle.position.z);

export { levelAt, FUEL_IDLE_RATE };




