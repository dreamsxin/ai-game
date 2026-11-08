// 装备槽：机翼之外的第二槽。纯数据 + 纯函数，不认识 three，也不认识 React。
//
// 三条设计边界（见 docs/equipment-plan.md）：
// 1. 机翼回答「怎么打穿 Boss 弱点」，装备回答「怎么活下来、怎么看得爽」。
//    所以僚机弹带 chipOnly，永远只按弱点 chip 结算；effectiveDps / bossHp 一行不动。
// 2. 装备走自己的成长轴：捡同型号 → 编队数 1→3，不叫阶级、不放相位冲击。
// 3. 装备不进存档，只在本局内跨关 carry；掉命掉一级，重试本章清空。
//
// 编队一律挂在主机**后侧**（y 更大 = 更靠近屏幕下方），不是左右平铺：
// 翼展 12.8 格既是判定宽度也是看到的宽度，两侧挂僚机会把它撑破。

import { FIELD_H, WING_HALF_W } from './rules.js';

/** 编队上限。三架就是「一整支小队」，再多屏幕上会糊成一团。 */
export const MAX_FORMATION = 3;
/** 替主机挡下致命一击之后的一小段无敌：挡完了还得有机会拉开。 */
export const GEAR_BLOCK_INVULN = 1.15;
/** 编队满员还捡到同型号：换成一笔分，不能白捡。 */
export const GEAR_FULL_SCORE = 180;

/**
 * 三型僚机，一型一形一色。layouts[0..2] 分别是编队数 1/2/3 时的坐标，
 * 每项 [dx, dy] 是相对主机的场地格偏移；|dx| 必须留在 WING_HALF_W 之内。
 * fire.spread 不是「每架发两发」，是每架交替往左右偏一点——弹数恒等于编队数，
 * 免得装备火力随型号膨胀，把弱点惩罚稀释掉。
 */
export const GEAR = {
  E1: {
    code: 'E1',
    name: '雁翎',
    kind: 'escort',
    title: '直射僚机',
    desc: '一对细长的雁翼，正后方列队直射',
    use: '火力最稳，近身消弹半径居中',
    hue: 190,
    shape: 'swept',
    layouts: [
      [[0, 14.5]],
      [[-4.6, 15.2], [4.6, 15.2]],
      [[-5.0, 15.8], [5.0, 15.8], [0, 19.0]],
    ],
    fire: { dmg: 0.55, cool: 0.46, vx: 0, vy: -96, spread: 0, life: 1.15 },
    aura: 3.0,
  },
  E2: {
    code: 'E2',
    name: '梭卫',
    kind: 'escort',
    title: '散射僚机',
    desc: '两支前掠梭翼，交替向左右偏射',
    use: '射得最勤，消弹圈最小',
    hue: 300,
    shape: 'needle',
    layouts: [
      [[0, 13.6]],
      [[-4.9, 14.6], [4.9, 14.6]],
      [[-4.9, 14.6], [4.9, 14.6], [0, 19.4]],
    ],
    fire: { dmg: 0.42, cool: 0.38, vx: 0, vy: -92, spread: 18, life: 1.2 },
    aura: 2.3,
  },
  E3: {
    code: 'E3',
    name: '环哨',
    kind: 'escort',
    title: '护卫僚机',
    desc: '贴身的环形护翼，绕着机尾慢慢转',
    use: '火力最弱，消弹圈最大',
    hue: 50,
    shape: 'ring',
    layouts: [
      [[0, 12.6]],
      [[-4.0, 13.6], [4.0, 13.6]],
      [[-4.4, 14.0], [4.4, 14.0], [0, 17.0]],
    ],
    fire: { dmg: 0.32, cool: 0.55, vx: 0, vy: -84, spread: 9, life: 1.25 },
    aura: 4.2,
  },
};

export const GEAR_CODES = Object.keys(GEAR);
export const gearSpec = (code) => GEAR[code] ?? null;
export const clampFormation = (level) =>
  Math.min(MAX_FORMATION, Math.max(0, Math.floor(Number(level) || 0)));

/** 这一型装备在场上叫什么、干什么用。选翼面板和 HUD 共用这一份。 */
export const gearLine = (code) => {
  const spec = gearSpec(code);
  return spec ? `${spec.desc}｜${spec.use}` : '';
};

/** 把存档/carry 里的装备描述压成 ship 上那四个字段。 */
export const gearFields = (gear = null) => {
  const level = gear?.code ? clampFormation(gear.level) : 0;
  return {
    gear: level > 0 ? gear.code : null,
    gearLevel: level,
    // 每次捡到装备补一次「替挡」机会；用了就没了，直到再捡一次或再合流一架。
    gearGuard: Boolean(gear?.guard) && level > 0,
    gearCool: 0,
  };
};

/**
 * 当前编队的世界坐标（纯函数，表现层与消弹判定都读这一份）。
 * 不进 hitBoxes：僚机不吃伤害，否则「带翼更容易被打中」这条教学被稀释。
 */
export function escortsOf(ship) {
  const spec = gearSpec(ship?.gear);
  const level = clampFormation(ship?.gearLevel);
  if (!spec || level < 1) return [];
  const layout = spec.layouts[level - 1];
  return layout.map(([dx, dy], index) => ({
    index,
    code: ship.gear,
    x: ship.x + dx,
    // 贴着画面底边飞时编队收拢，不许尾巴甩出场地：
    // 判定位置与看到的位置始终是同一个数，不能靠表现层偷偷挪。
    y: Math.min(FIELD_H - 5, ship.y + dy),
    r: spec.aura,
    hue: spec.hue,
    shape: spec.shape,
  }));
}

/** 编队整体不许越出判定翼展（含僚机自己的半宽与光晕）。 */
export const ESCORT_HALF_W = 1.3;
export const escortWithinSpan = (ship) =>
  escortsOf(ship).every((escort) => Math.abs(escort.x - ship.x) + ESCORT_HALF_W <= WING_HALF_W);

/**
 * 捡到一件装备。返回新字段 + 事件类型，供 simulation.js 决定飘字、分数和要不要掉出旧件。
 * 同型号 → 编队 +1（满 3 换分）；换型号 → 编队重置为 1，旧件脱手还能捡回来。
 */
export function gearPick(ship, code) {
  const spec = gearSpec(code);
  if (!spec) return { kind: 'invalid', fields: gearFields(null), old: null };
  const current = ship?.gear ?? null;
  if (!current) return { kind: 'new', fields: gearFields({ code, level: 1, guard: true }), old: null };
  if (current === code) {
    const level = clampFormation(ship.gearLevel);
    if (level >= MAX_FORMATION) {
      return { kind: 'full', fields: { ...gearFields({ code, level, guard: true }) }, old: null };
    }
    return { kind: 'sync', fields: gearFields({ code, level: level + 1, guard: true }), old: null };
  }
  return {
    kind: 'swap',
    fields: gearFields({ code, level: 1, guard: true }),
    old: { code: current, level: clampFormation(ship.gearLevel) },
  };
}

/**
 * 替主机挡下致命一击：消耗一架僚机，同时把这一关的替挡机会用掉。
 * 编队归零时装备槽清空（不是留一个空编号在 HUD 上骗人）。
 */
export function gearAfterBlock(ship) {
  const left = Math.max(0, clampFormation(ship?.gearLevel) - 1);
  return {
    ...ship,
    gear: left > 0 ? ship.gear : null,
    gearLevel: left,
    gearGuard: false,
  };
}

/**
 * 掉命：装备掉一级，不清零。
 * 理由见 docs/equipment-plan.md §7 —— 这一版刚补了跨章补给与本章重试，
 * 「掉一次命就失去全部投资」会把人推进死亡螺旋，而掉一级仍然是实打实的代价。
 * 掉到 0 才清空；重试本章则整槽作废。
 */
export function gearAfterLoss(ship) {
  const left = Math.max(0, clampFormation(ship?.gearLevel) - 1);
  return {
    ...ship,
    gear: left > 0 ? ship.gear : null,
    gearLevel: left,
    gearGuard: Boolean(ship?.gearGuard),
  };
}

/** 一型僚机一轮齐射：弹数恒等于编队数，每发都带着 chipOnly 标记。 */
export function gearVolley(ship, nextId = 1) {
  const spec = gearSpec(ship?.gear);
  if (!spec || clampFormation(ship.gearLevel) < 1) return { shots: [], nextId };
  const shots = [];
  let id = nextId;
  for (const escort of escortsOf(ship)) {
    // 交替偏射，且 |vx| 故意压在 40 以下：侧向弱点要 |vx| > 40，
    // 僚机弹不该「碰巧」打进任何装甲弱点。
    const bias = spec.fire.spread ? (escort.index % 2 === 0 ? 1 : -1) * spec.fire.spread : 0;
    shots.push({
      id,
      x: escort.x,
      y: escort.y - 2.2,
      vx: (spec.fire.vx ?? 0) + bias,
      vy: spec.fire.vy,
      dmg: spec.fire.dmg,
      kind: 'escort',
      source: 'gear',
      chipOnly: true,
      gearCode: ship.gear,
      escort: escort.index,
      pierce: null,
      ground: false,
      blast: 0,
      well: 0,
      chain: 0,
      chainR: 0,
      chainFall: 0,
      burst: 0,
      burstDmg: 0,
      echo: false,
      life: spec.fire.life,
      tier: 1,
      surge: false,
      age: 0,
    });
    id += 1;
  }
  return { shots, nextId: id };
}
