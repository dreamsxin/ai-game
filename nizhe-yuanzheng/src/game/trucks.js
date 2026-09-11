// 卡车规格表。每台车只是一组数字：质量、轴距、悬挂、扭矩曲线、油箱。
// 车辆动力学完全由 vehicle.js 按这些数字算，所以调平衡只改这里。
import { MATERIALS } from './rules.js';

/** 由轴定义摊平成车轮列表。左右对称，避免手写六个轮子的坐标写错正负。
 *  y 是悬挂上支点相对重心的高度，必须满足 comY = radius + rest·0.55 - y，
 *  否则出生时车会陷进地里或者悬在半空。restingHeight() 就是这条式子的反解。 */
function wheelsOf(axles) {
  const wheels = [];
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      wheels.push({
        x: axle.halfTrack * side,
        y: axle.y,
        z: axle.z,
        side,
        radius: axle.radius,
        width: axle.width,
        steered: Boolean(axle.steered),
        axle: axle.name,
        powered: axle.powered,
      });
    }
  }
  return wheels;
}

// 轮胎。hard 是硬地折扣，soft 是软地折扣，sink 越小越不容易陷。
// 公路胎在土路上很快，一进泥就废；防滑链反过来。
export const TIRES = [
  { id: 'road', name: '公路胎', hard: 1.06, soft: 0.6, sink: 1.16 },
  { id: 'all', name: '全地形胎', hard: 0.96, soft: 0.9, sink: 1 },
  { id: 'mud', name: '泥地胎', hard: 0.86, soft: 1.16, sink: 0.88 },
  { id: 'chain', name: '防滑链', hard: 0.78, soft: 1.32, sink: 0.8 },
];

export const tireOf = (id) => TIRES.find((tire) => tire.id === id) ?? TIRES[1];

// 材质的「软」程度，用来在 hard / soft 两个折扣之间插值。深泥沼是 1。
const MAX_SINK = Math.max(...MATERIALS.map((material) => material.sink));
export const softnessOf = (material) => Math.min(1, material.sink / MAX_SINK);

/** 轮胎在某种地面上的摩擦折扣。 */
export function tireGrip(tire, material) {
  const softness = softnessOf(material);
  return tire.hard * (1 - softness) + tire.soft * softness;
}

export const TRUCKS = [
  {
    id: 'scout',
    name: '山猫 S3',
    kind: '轻型侦察车',
    blurb: '轻、快、能翻上土坡，但一箱货就压得它抬不起头。',
    mass: 3200,
    body: { length: 4.6, width: 2.06, height: 1.5 },
    comY: 0.82,
    cargoComY: 1.62,
    slots: 2,
    fuel: 90,
    snorkel: 0.95,
    awdDefault: true,
    tire: 'all',
    finalDrive: 9.4,
    engine: {
      idle: 820,
      max: 4600,
      curve: [
        { rpm: 800, nm: 230 },
        { rpm: 1600, nm: 420 },
        { rpm: 2400, nm: 520 },
        { rpm: 3400, nm: 470 },
        { rpm: 4600, nm: 320 },
      ],
    },
    suspension: { rest: 0.34, stiffness: 62000, damping: 5200, maxTravel: 0.34 },
    steerMax: 0.62,
    steerRate: 2.6,
    axles: wheelsOf([
      { name: 'front', z: -1.42, halfTrack: 1, y: -0.193, radius: 0.44, width: 0.3, steered: true, powered: 'front' },
      { name: 'rear', z: 1.42, halfTrack: 1, y: -0.193, radius: 0.44, width: 0.3, powered: 'rear' },
    ]),
  },
  {
    id: 'hauler',
    name: '塔戈 T6',
    kind: '中型越野卡车',
    blurb: '三轴六驱的老黄牛。不快，但泥里一步一步爬得动。',
    mass: 8600,
    body: { length: 7.4, width: 2.5, height: 2.1 },
    comY: 1.12,
    cargoComY: 2.35,
    slots: 3,
    fuel: 210,
    snorkel: 1.32,
    awdDefault: true,
    tire: 'mud',
    finalDrive: 12.6,
    engine: {
      idle: 660,
      max: 2900,
      curve: [
        { rpm: 650, nm: 780 },
        { rpm: 1100, nm: 1240 },
        { rpm: 1500, nm: 1380 },
        { rpm: 2100, nm: 1250 },
        { rpm: 2900, nm: 880 },
      ],
    },
    suspension: { rest: 0.4, stiffness: 118000, damping: 9400, maxTravel: 0.4 },
    steerMax: 0.5,
    steerRate: 1.9,
    axles: wheelsOf([
      { name: 'front', z: -2.3, halfTrack: 1.18, y: -0.24, radius: 0.66, width: 0.46, steered: true, powered: 'front' },
      { name: 'mid', z: 1.32, halfTrack: 1.18, y: -0.24, radius: 0.66, width: 0.46, powered: 'rear' },
      { name: 'rear', z: 2.62, halfTrack: 1.18, y: -0.24, radius: 0.66, width: 0.46, powered: 'rear' },
    ]),
  },
  {
    id: 'heavy',
    name: '磐石 K9',
    kind: '重型牵引车',
    blurb: '爬行挡下扭矩管够，慢得让人心慌，但泥沼里只有它出得来。',
    mass: 13800,
    body: { length: 8.2, width: 2.72, height: 2.3 },
    comY: 1.2,
    cargoComY: 2.5,
    slots: 4,
    fuel: 320,
    snorkel: 1.62,
    awdDefault: true,
    tire: 'chain',
    finalDrive: 16.4,
    engine: {
      idle: 600,
      max: 2400,
      curve: [
        { rpm: 600, nm: 1350 },
        { rpm: 1000, nm: 2050 },
        { rpm: 1350, nm: 2260 },
        { rpm: 1900, nm: 1980 },
        { rpm: 2400, nm: 1450 },
      ],
    },
    suspension: { rest: 0.46, stiffness: 176000, damping: 14200, maxTravel: 0.46 },
    steerMax: 0.46,
    steerRate: 1.6,
    axles: wheelsOf([
      { name: 'front', z: -2.6, halfTrack: 1.28, y: -0.187, radius: 0.76, width: 0.52, steered: true, powered: 'front' },
      { name: 'mid', z: 1.5, halfTrack: 1.28, y: -0.187, radius: 0.76, width: 0.52, powered: 'rear' },
      { name: 'rear', z: 3.02, halfTrack: 1.28, y: -0.187, radius: 0.76, width: 0.52, powered: 'rear' },
    ]),
  },
];

export const truckOf = (id) => TRUCKS.find((truck) => truck.id === id) ?? TRUCKS[1];

// 静止时悬挂被压掉的行程比例。出生高度和 axle.y 都由它推出来。
export const STATIC_COMPRESSION = 0.55;

/** 静止时重心离地高度。它必须等于 spec.comY，trucks.test.js 会逐台核对。 */
export function restingHeight(spec) {
  const axle = spec.axles[0];
  return axle.radius + spec.suspension.rest * STATIC_COMPRESSION - axle.y;
}
