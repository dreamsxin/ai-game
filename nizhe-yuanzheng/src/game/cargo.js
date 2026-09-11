// 货物：质量、重心抬升、装卸判定。
// 装货不只是加数字——重心一抬高，同一个弯就能把车掀翻，这是关卡难度的主要来源。
import { ARRIVE_RADIUS, ARRIVE_SPEED } from './rules.js';

export const CARGO_TYPES = {
  timber: { id: 'timber', name: '木料', mass: 700, color: 0x8a6a3d, size: { x: 1.9, y: 0.7, z: 3.6 } },
  pipes: { id: 'pipes', name: '钢管', mass: 1500, color: 0x7f8489, size: { x: 1.9, y: 0.8, z: 4.6 } },
  transformer: { id: 'transformer', name: '变压器', mass: 1900, color: 0x4c5a63, size: { x: 1.8, y: 1.1, z: 1.8 } },
};

export const cargoTypeOf = (id) => CARGO_TYPES[id] ?? CARGO_TYPES.timber;

export const cargoMass = (cargo) => cargo.reduce((sum, item) => sum + cargoTypeOf(item.type).mass, 0);

/**
 * 载货后的总质量与重心抬升量。
 * 重心上移会把车轮悬挂点相对重心往下推，vehicle.js 每帧照这个值重算悬挂几何，
 * 于是横向加速度产生的翻车力矩自然变大——不需要额外的「翻车判定」硬编码。
 * 抬升量夹在悬挂行程的六成内：再高的话支点会被推到轮心以下，几何直接失效。
 */
export function loadedMass(spec, cargo) {
  const extra = cargoMass(cargo);
  const total = spec.mass + extra;
  const raw = extra > 0 ? (extra * (spec.cargoComY - spec.comY)) / total : 0;
  return { mass: total, extra, comLift: Math.min(raw, spec.suspension.rest * 0.6) };
}

/** 车停稳且在半径内才算「在场地里」，飞驰而过不能算交付。 */
export function atSite(site, position, speed) {
  if (!site) return false;
  const distance = Math.hypot(position.x - site.x, position.z - site.z);
  return distance <= (site.radius ?? ARRIVE_RADIUS) && speed <= ARRIVE_SPEED;
}

/** 装一件货。装满、不在货场、或者车还在动都装不了。 */
export function loadOne(cargo, spec, pending) {
  if (cargo.length >= spec.slots) return { cargo, loaded: false, reason: '车厢满了' };
  if (pending <= 0) return { cargo, loaded: false, reason: '货场已空' };
  return { cargo: [...cargo, { type: pending.type ?? pending }], loaded: true };
}

/** 卸一件货。 */
export function unloadOne(cargo) {
  if (cargo.length === 0) return { cargo, unloaded: null };
  return { cargo: cargo.slice(0, -1), unloaded: cargo[cargo.length - 1] };
}

/** 侧翻或者重击会甩掉最上面那件货，掉了就得回货场重装。 */
export function shedCargo(cargo, count = 1) {
  if (cargo.length === 0) return { cargo, lost: 0 };
  const keep = Math.max(0, cargo.length - count);
  return { cargo: cargo.slice(0, keep), lost: cargo.length - keep };
}

/** 车厢里每件货的摆放位置（车身坐标），渲染和重心都用它。 */
export function cargoLayout(spec, cargo) {
  const bed = { z: spec.body.length * 0.16, y: spec.body.height * 0.62 };
  return cargo.map((item, index) => {
    const type = cargoTypeOf(item.type);
    const row = Math.floor(index / 2);
    const column = index % 2;
    return {
      type: type.id,
      color: type.color,
      size: type.size,
      x: cargo.length > 1 ? (column - 0.5) * (type.size.x * 0.54) : 0,
      y: bed.y + type.size.y * (0.5 + row * 1.05),
      z: bed.z,
    };
  });
}
