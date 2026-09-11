// 车辆动力学：六自由度刚体 + 每轮射线悬挂 + 轮胎模型 + 泥地下陷。
// 这是整个游戏的心脏，也是唯一一处需要小步长积分的地方（PHYS_STEP = 1/120）。
// 约定：position 就是重心，wheel.y 是悬挂上支点相对重心的高度，装货会把支点往下推。
import {
  AIR_DENSITY,
  GRAVITY,
  IMPACT_DAMAGE,
  IMPACT_THRESHOLD,
  ROLLOVER_TILT,
  WATER_POWER_LOSS,
} from './rules.js';
import { addRut, groundAt, sinkCapacity } from './terrain.js';
import { nearbyProps } from './level.js';
import {
  autoShift,
  distributeTorque,
  drivelineTorque,
  engineRpm,
  gearDirection,
  gearModeOf,
  gearRatio,
  isDriven,
} from './powertrain.js';
import { STATIC_COMPRESSION, tireGrip, tireOf } from './trucks.js';
import {
  freeRollSpin,
  longitudinalSlip,
  rollingDrag,
  rutCut,
  sinkDepth,
  slipAngleOf,
  spinWaste,
  tireForces,
} from './tire.js';
import {
  add,
  basisOf,
  clamp,
  cross,
  dot,
  length,
  lengthXZ,
  lerp,
  normalize,
  project,
  quatFromYaw,
  quatIntegrate,
  rotate,
  scale,
  sign,
  sub,
  tiltOf,
  unrotate,
  vec,
} from './vec.js';

const EMPTY_CONTROLS = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/** 箱体转动惯量，略微放大：真车的框架和货厢比理想箱体更「不情愿」转动。 */
function inertiaOf(spec, mass) {
  const { length: len, width, height } = spec.body;
  const k = 1.18;
  return {
    x: ((mass * (height * height + len * len)) / 12) * k,
    y: ((mass * (width * width + len * len)) / 12) * k,
    z: ((mass * (width * width + height * height)) / 12) * k,
  };
}

export function createVehicle(spec, start) {
  return {
    spec,
    position: vec(start.x, start.y ?? 0, start.z),
    quaternion: quatFromYaw(start.yaw ?? 0),
    velocity: vec(),
    angularVelocity: vec(),
    wheels: spec.axles.map((axle) => ({
      ...axle,
      compression: spec.suspension.rest * STATIC_COMPRESSION,
      spin: 0,
      steer: 0,
      load: 0,
      sink: 0,
      sinkLoad: 0,
      slipRatio: 0,
      slipAngle: 0,
      saturation: 0,
      capacity: 0,
      drag: 0,
      waste: 0,
      contact: false,
      groundY: 0,
      materialIndex: 2,
      center: vec(),
      contactPoint: vec(),
    })),
    steer: 0,
    throttle: 0,
    brake: 0,
    gear: 'N',
    autoIndex: 0,
    rpm: spec.engine.idle,
    awd: spec.awdDefault,
    diffLock: false,
    mass: spec.mass,
    comLift: 0,
    speed: 0,
    forwardSpeed: 0,
    tilt: 0,
    submerged: 0,
    contacts: 0,
    avgSink: 0,
    slipping: 0,
    impact: 0,
    dug: 0,
  };
}

/** 悬挂上支点（车身坐标）。装货抬高重心，等价于把整组支点往下移。 */
export const hardpointOf = (wheel, comLift) => ({ x: wheel.x, y: wheel.y - comLift, z: wheel.z });

/** 出生高度：让轮子正好落在地面上，别陷进去也别悬空。 */
export const restingY = (spec, groundY) => groundY + spec.comY;

/** 转向轮的车身前向：绕车身 y 轴转 steer，正值向右。 */
const steerForward = (angle) => ({ x: Math.sin(angle), y: 0, z: -Math.cos(angle) });

/** 下陷深度的响应时间。泥要被挤开才让轮子往下走，不是瞬间的事。
 *  这个滞后同时也是数值上的必需品：载荷→下陷→接地高度→载荷是一个正反馈环，
 *  直接用上一帧载荷会让三根轴各自跳到互相矛盾的行程上。 */
const SINK_LAG = 0.28;

/**
 * 单轮解算：悬挂行程、载荷、下陷、接地坐标系、滑移与轮胎力。
 * 悬挂沿车身 -up 方向，接地条件只用竖直分量求解——悬挂行程远小于地形起伏尺度，
 * 这个近似换来的是不必对高度场做真正的射线求交。
 */
function solveWheel(vehicle, wheel, terrain, dt) {
  const spec = vehicle.spec;
  const up = vehicle.basis.up;
  const rest = spec.suspension.rest;
  const hardpoint = add(vehicle.position, rotate(vehicle.quaternion, hardpointOf(wheel, vehicle.comLift)));
  const ground = groundAt(terrain, hardpoint.x, hardpoint.z);
  const tire = tireOf(spec.tire);
  const staticLoad = (vehicle.mass * GRAVITY) / vehicle.wheels.length;
  const follow = Math.min(1, dt / SINK_LAG);
  wheel.sinkLoad = lerp(wheel.sinkLoad || staticLoad, wheel.load || staticLoad, follow);
  const target = sinkDepth(wheel.sinkLoad, wheel.radius, wheel.width, sinkCapacity(terrain, ground.index), tire.sink);
  wheel.sink += (target - wheel.sink) * follow;
  const sink = wheel.sink;
  const floor = ground.y - sink;

  wheel.groundY = ground.y;
  wheel.materialIndex = ground.materialIndex;
  wheel.groundIndex = ground.index;
  wheel.normal = ground.normal;

  if (up.y < 0.08) {
    // 车侧翻过来了，竖直近似失效：当作全部离地，让重力把它摔回去。
    wheel.contact = false;
    wheel.compression = 0;
    wheel.load = 0;
    wheel.fx = 0;
    wheel.fy = 0;
    wheel.drag = 0;
    wheel.capacity = 0;
    wheel.center = sub(hardpoint, scale(up, rest));
    wheel.contactPoint = wheel.center;
    return;
  }

  const extension = (hardpoint.y - wheel.radius - floor) / up.y;
  wheel.compression = clamp(rest - extension, 0, rest);
  wheel.contact = wheel.compression > 0;
  wheel.center = sub(hardpoint, scale(up, rest - wheel.compression));
  wheel.contactPoint = sub(wheel.center, scale(ground.normal, wheel.radius));

  const arm = sub(hardpoint, vehicle.position);
  const pointVelocity = add(vehicle.velocity, cross(vehicle.angularVelocity, arm));
  if (!wheel.contact) {
    wheel.load = 0;
    wheel.fx = 0;
    wheel.fy = 0;
    wheel.drag = 0;
    wheel.capacity = 0;
    wheel.slipRatio = 0;
    wheel.slipAngle = 0;
    wheel.saturation = 0;
    wheel.waste = 0;
    wheel.closing = 0;
    return;
  }

  const spring = spec.suspension.stiffness * wheel.compression;
  const damper = spec.suspension.damping * dot(pointVelocity, up);
  wheel.load = Math.max(0, spring - damper);
  wheel.closing = -dot(pointVelocity, up);

  const forward = normalize(project(rotate(vehicle.quaternion, steerForward(wheel.steer)), ground.normal));
  const lateral = normalize(cross(ground.normal, forward));
  const vLong = dot(pointVelocity, forward);
  const vLat = dot(pointVelocity, lateral);
  wheel.forward = forward;
  wheel.lateral = lateral;
  wheel.vLong = vLong;
  wheel.slipRatio = longitudinalSlip(wheel.spin, wheel.radius, vLong);
  wheel.slipAngle = slipAngleOf(vLong, vLat);

  const forces = tireForces({
    load: wheel.load,
    grip: ground.material.grip * tireGrip(tireOf(spec.tire), ground.material),
    slipRatio: wheel.slipRatio,
    slipAngle: wheel.slipAngle,
    radius: wheel.radius,
    sink,
  });
  wheel.fx = forces.fx;
  wheel.fy = forces.fy;
  wheel.saturation = forces.saturation;
  wheel.capacity = forces.mu * wheel.load * wheel.radius;
  wheel.drag = rollingDrag(wheel.load, ground.material.roll, sink, wheel.radius);
}

/** 车轮转动惯量。大轮更重也更难停下来，爬行挡的迟滞感有一半来自这里。 */
export const wheelInertia = (radius) => 0.5 * (28 + 260 * radius * radius) * radius * radius;

/**
 * 车身撞树撞石头。只做水平圆柱推出：把车推开、抵掉法向速度、按接近速度记伤。
 * 树不会被撞倒——在泥地里指望撞开一棵树本来就是幻想。
 */
function resolveObstacles(vehicle, level) {
  const spec = vehicle.spec;
  const shell = Math.max(spec.body.width, spec.body.length * 0.42) * 0.5;
  let impact = 0;
  for (const index of nearbyProps(level, vehicle.position.x, vehicle.position.z)) {
    const prop = level.props[index];
    if (vehicle.position.y - spec.comY > prop.y + prop.height) continue;
    const dx = vehicle.position.x - prop.x;
    const dz = vehicle.position.z - prop.z;
    const distance = Math.hypot(dx, dz);
    const minimum = shell + prop.radius;
    if (distance >= minimum || distance < 1e-4) continue;
    const nx = dx / distance;
    const nz = dz / distance;
    const closing = -(vehicle.velocity.x * nx + vehicle.velocity.z * nz);
    const push = minimum - distance;
    vehicle.position.x += nx * push;
    vehicle.position.z += nz * push;
    if (closing > 0) {
      vehicle.velocity.x += nx * closing;
      vehicle.velocity.z += nz * closing;
      // 撞上之后车会被拨一下车头，正撞和刮擦的手感因此不同。
      vehicle.angularVelocity.y += (nx * dz - nz * dx) * 0.04;
      impact = Math.max(impact, closing);
    }
  }
  return impact;
}

/**
 * 推进一个物理子步。原地修改 vehicle（实时循环里每帧要跑好几次，不适合造新对象）。
 * external 是外部力列表（目前只有绞盘），每项形如 { force, point }，point 是世界坐标。
 * 返回这一步的观测量，交给上层记账：伤害、油耗、压出来的车辙。
 */
export function stepVehicle(vehicle, level, controls = EMPTY_CONTROLS, dt, external = []) {
  const spec = vehicle.spec;
  const terrain = level.terrain;
  const wheels = vehicle.wheels;
  vehicle.basis = basisOf(vehicle.quaternion);
  const up = vehicle.basis.up;

  // 涉水：排气管淹了就掉功率，浸没越深浮力越大、抓地越差。
  const wheelLine = vehicle.position.y - spec.comY;
  vehicle.submerged = Math.max(0, terrain.water - wheelLine);
  const drown = vehicle.submerged / spec.snorkel;
  const powerScale = clamp(1 - WATER_POWER_LOSS * Math.max(0, drown - 0.55), 0, 1);
  const throttle = clamp(controls.throttle, 0, 1);
  const brakeInput = clamp(Math.max(controls.brake, controls.handbrake ? 1 : 0), 0, 1);

  // 转向：车速越高可用转角越小，否则高速一打方向就是原地掉头。
  const speedFade = clamp(1 - Math.abs(vehicle.forwardSpeed) / 26, 0.34, 1);
  const target = clamp(controls.steer, -1, 1) * spec.steerMax * speedFade;
  vehicle.steer += clamp(target - vehicle.steer, -spec.steerRate * dt, spec.steerRate * dt);
  for (const wheel of wheels) wheel.steer = wheel.steered ? vehicle.steer : 0;

  for (const wheel of wheels) solveWheel(vehicle, wheel, terrain, dt);

  // 动力：先由驱动轮平均转速反推发动机转速，再决定这一挡能给出多少扭矩。
  const ratio = gearRatio(vehicle.gear, vehicle.autoIndex);
  const direction = gearDirection(vehicle.gear);
  const totalRatio = ratio * spec.finalDrive;
  const driven = wheels.filter((wheel) => isDriven(wheel, vehicle.awd));
  const avgSpin = driven.length ? driven.reduce((sum, wheel) => sum + wheel.spin, 0) / driven.length : 0;
  vehicle.rpm = engineRpm(spec.engine, avgSpin * direction, totalRatio);
  if (gearModeOf(vehicle.gear).auto) {
    vehicle.autoIndex = autoShift(spec.engine, vehicle.autoIndex, vehicle.rpm, throttle);
  }
  const crawling = vehicle.gear === 'LL';
  const magnitude = drivelineTorque(spec, vehicle.gear, vehicle.autoIndex, vehicle.rpm, throttle * powerScale);
  const torques = distributeTorque(wheels, magnitude, { awd: vehicle.awd, diffLock: vehicle.diffLock || crawling });

  let force = vec(0, -vehicle.mass * GRAVITY, 0);
  let torque = vec();
  const applyAt = (f, point) => {
    force = add(force, f);
    torque = add(torque, cross(sub(point, vehicle.position), f));
  };

  const brakeTorque = (vehicle.mass * GRAVITY * 1.1) / wheels.length;
  const revSpin = totalRatio > 0 ? ((spec.engine.max + 260) * Math.PI * 2) / 60 / totalRatio : Infinity;
  let contacts = 0;
  let sinkSum = 0;
  let slipping = 0;
  let dug = 0;
  let bottomed = 0;

  for (let index = 0; index < wheels.length; index += 1) {
    const wheel = wheels[index];
    const inertia = wheelInertia(wheel.radius);
    const drive = torques[index] * direction;
    const reaction = wheel.contact ? wheel.fx * wheel.radius : 0;
    let spin = wheel.spin + ((drive - reaction) / inertia) * dt;

    // 刹车：扭矩总是反抗当前转向，并且一步之内不许把轮子反向踢过零点。
    if (brakeInput > 0) {
      const hold = Math.min(brakeTorque * brakeInput * dt, Math.abs(spin) * inertia);
      spin -= (hold / inertia) * sign(spin);
      if (controls.handbrake && Math.abs(spin) < 0.6) spin = 0;
    }
    wheel.spin = clamp(spin, -revSpin, revSpin);

    if (!wheel.contact) continue;
    contacts += 1;
    sinkSum += wheel.sink;
    wheel.waste = spinWaste(wheel.spin, wheel.radius, wheel.vLong);
    if (isDriven(wheel, vehicle.awd)) slipping = Math.max(slipping, wheel.waste);
    if (wheel.compression >= spec.suspension.rest * 0.995) bottomed = Math.max(bottomed, wheel.closing);

    const hardpoint = add(vehicle.position, rotate(vehicle.quaternion, hardpointOf(wheel, vehicle.comLift)));
    applyAt(scale(up, wheel.load), hardpoint);
    const traction = add(scale(wheel.forward, wheel.fx), scale(wheel.lateral, wheel.fy));
    // 滚阻和推泥阻力作用在接地点，方向永远反抗车轮的前进方向。
    // 上限只保证这一步不会把速度推过零点——再收紧就等于偷偷削弱泥地。
    const stop = (Math.abs(wheel.vLong) * vehicle.mass) / (wheels.length * dt);
    const resist = scale(wheel.forward, -sign(wheel.vLong) * Math.min(wheel.drag, stop));
    applyAt(add(traction, resist), wheel.contactPoint);
    dug += addRut(terrain, wheel.groundIndex, rutCut(wheel.load, wheel.slipRatio, wheel.sink, dt));
  }

  // 空气阻力。卡车速度不高，作用主要是给最高速一个上限。
  const speed = length(vehicle.velocity);
  if (speed > 0.1) {
    const area = spec.body.width * spec.body.height * 0.9;
    force = add(force, scale(vehicle.velocity, -0.5 * AIR_DENSITY * area * speed));
  }

  // 浮力与水阻。淹到一半车会变轻，于是抓地更差——涉水最怕的是浮起来。
  if (vehicle.submerged > 0) {
    const fraction = clamp(vehicle.submerged / spec.body.height, 0, 1);
    force = add(force, vec(0, fraction * vehicle.mass * GRAVITY * 0.55, 0));
    force = add(force, scale(vehicle.velocity, -fraction * vehicle.mass * 0.12));
  }

  for (const entry of external) applyAt(entry.force, entry.point);

  // 积分。角速度在车身坐标系里除以对角惯量，再转回世界系。
  vehicle.velocity = add(vehicle.velocity, scale(force, dt / vehicle.mass));
  const inertia = inertiaOf(spec, vehicle.mass);
  const bodyTorque = unrotate(vehicle.quaternion, torque);
  const bodyOmega = unrotate(vehicle.quaternion, vehicle.angularVelocity);
  bodyOmega.x += (bodyTorque.x / inertia.x) * dt;
  bodyOmega.y += (bodyTorque.y / inertia.y) * dt;
  bodyOmega.z += (bodyTorque.z / inertia.z) * dt;
  const damping = Math.max(0, 1 - 1.6 * dt);
  vehicle.angularVelocity = scale(rotate(vehicle.quaternion, bodyOmega), damping);
  vehicle.position = add(vehicle.position, scale(vehicle.velocity, dt));
  vehicle.quaternion = quatIntegrate(vehicle.quaternion, vehicle.angularVelocity, dt);

  const impact = Math.max(resolveObstacles(vehicle, level), bottomed > IMPACT_THRESHOLD ? bottomed : 0);

  // 兜底：车身穿地时抬回来。陡坡上竖直近似会漏，没有这一步车会掉进山里。
  // 门槛必须把下陷算进去——车陷在泥里时车身本来就该贴着地面，
  // 拿干地的离地高度当门槛会凭空把车顶起来，泥地的阻力也就白算了。
  const deepest = wheels.reduce((most, wheel) => Math.max(most, wheel.sink), 0);
  const floorY = groundAt(terrain, vehicle.position.x, vehicle.position.z).y - deepest - spec.comY * 0.25;
  if (vehicle.position.y < floorY) {
    vehicle.position.y = floorY;
    if (vehicle.velocity.y < 0) vehicle.velocity.y *= -0.15;
  }
  const bound = terrain.half - 6;
  if (Math.abs(vehicle.position.x) > bound || Math.abs(vehicle.position.z) > bound) {
    vehicle.position.x = clamp(vehicle.position.x, -bound, bound);
    vehicle.position.z = clamp(vehicle.position.z, -bound, bound);
    vehicle.velocity = scale(vehicle.velocity, 0.2);
  }

  vehicle.speed = lengthXZ(vehicle.velocity);
  vehicle.forwardSpeed = dot(vehicle.velocity, vehicle.basis.forward);
  vehicle.tilt = tiltOf(vehicle.quaternion);
  vehicle.contacts = contacts;
  vehicle.avgSink = contacts > 0 ? sinkSum / contacts : 0;
  vehicle.slipping = slipping;
  vehicle.impact = impact;
  vehicle.dug = dug;
  vehicle.rolled = vehicle.tilt > ROLLOVER_TILT;
  return {
    impact,
    damage: impact > IMPACT_THRESHOLD ? (impact - IMPACT_THRESHOLD) * IMPACT_DAMAGE : 0,
    throttle,
    powerScale,
    dug,
  };
}





