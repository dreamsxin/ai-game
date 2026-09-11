// 无头自动驾驶。用来验证「这一关到底开不开得过去」——
// 物理调参最容易翻车的地方不是数值爆掉，而是悄悄变成一台谁也开不动的车。
import { nearestOnRoute } from '../../src/game/terrain.js';
import { handleCargo, recover, setGear, step, toggleDiffLock } from '../../src/game/simulation.js';
import { wrapAngle, yawOf } from '../../src/game/vec.js';

/** 前视点：沿路线取当前位置往前 lookahead 米处的坐标。lookahead 取负就是往回看。 */
export function lookAheadPoint(route, x, z, lookahead = 24) {
  const near = nearestOnRoute(route, x, z);
  const want = near.along + lookahead;
  if (want <= 0) return { x: route[0].x, z: route[0].z };
  let travelled = 0;
  for (let index = 0; index + 1 < route.length; index += 1) {
    const a = route[index];
    const b = route[index + 1];
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    if (travelled + segment >= want) {
      const t = Math.min(1, Math.max(0, (want - travelled) / segment));
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    travelled += segment;
  }
  const last = route[route.length - 1];
  return { x: last.x, z: last.z };
}

/**
 * 朝前视点打方向，并按滑移率收油门。
 * 收油门这一步不是为了开得漂亮：泥地里焖油会把车埋进去，
 * 「把滑移压在峰值附近」是这游戏唯一有效的驾驶技术，自动驾驶也得照做。
 */
export function autopilot(state, { cruise = 9, back = false } = {}) {
  const { vehicle } = state;
  const aim = lookAheadPoint(state.level.route, vehicle.position.x, vehicle.position.z, back ? -24 : 24);
  const want = Math.atan2(aim.x - vehicle.position.x, -(aim.z - vehicle.position.z));
  const error = wrapAngle(want - yawOf(vehicle.quaternion));
  const steer = Math.max(-1, Math.min(1, error * 1.8));
  const tooFast = vehicle.speed > cruise;
  // 起步阶段轮子必然打滑（车还没动，轮面已经在转），这时候收油门只会让车顺坡溜下去。
  // 所以牵引力控制从 1.5 m/s 以上才介入。
  const rolling = vehicle.speed > 1.5;
  const traction = rolling && vehicle.slipping > 0.55 ? Math.max(0.2, 1 - (vehicle.slipping - 0.55) * 1.8) : 1;
  const launching = !rolling;
  return {
    throttle: tooFast ? 0.12 : Math.max(0.2, (1 - Math.abs(steer) * (launching ? 0.15 : 0.4)) * traction),
    brake: tooFast && Math.abs(steer) > 0.6 ? 0.4 : 0,
    steer,
    handbrake: false,
    winch: false,
  };
}

/** 该挂哪个挡：越陷越低挡。真人也是这么开的，自动驾驶不该有例外。 */
export function pickGear(state) {
  const { vehicle } = state;
  if (vehicle.avgSink > 0.3 || vehicle.slipping > 0.75) return 'LL';
  if (vehicle.avgSink > 0.14 || vehicle.slipping > 0.5) return 'L';
  return 'A';
}

/**
 * 跑一整趟：装满货、挂挡、开到交付点、卸完。
 * 陷住超过 stuckLimit 秒就调用救援——真人会用绞盘，这里只关心「关卡能不能通」。
 */
export function driveMission(state, { seconds = 900, dt = 1 / 60, cruise = 9, stuckLimit = 6 } = {}) {
  setGear(state, 'A');
  toggleDiffLock(state);
  let stuck = 0;
  let recoveries = 0;
  const frames = Math.floor(seconds / dt);
  for (let frame = 0; frame < frames; frame += 1) {
    if (state.status === 'won' || state.status === 'lost') break;
    // 装满了（或者货场空了）就去交付点，卸完了再回货场。货比车厢多就得跑几趟。
    const laden = state.cargo.length >= state.spec.slots || (state.cargo.length > 0 && state.pending === 0);
    const target = laden ? state.level.site : state.level.depot;
    const distance = Math.hypot(state.vehicle.position.x - target.x, state.vehicle.position.z - target.z);
    const arriving = distance < target.radius * 0.7;
    // 到点必须停稳才能装卸，所以进场就刹车——不刹的话会一路开过去。
    if (arriving) {
      step(state, { throttle: 0, brake: 1, steer: 0, handbrake: state.vehicle.speed < 1, winch: false }, dt);
      handleCargo(state);
      continue;
    }
    if (frame % 30 === 0) setGear(state, pickGear(state));
    step(state, autopilot(state, { cruise, back: !laden }), dt);
    stuck = state.vehicle.speed < 0.5 ? stuck + dt : 0;
    if (stuck > stuckLimit) {
      recover(state);
      setGear(state, 'A');
      stuck = 0;
      recoveries += 1;
    }
  }
  return { state, recoveries };
}
