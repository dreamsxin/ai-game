// 装备槽：机翼之外的第二槽。纯数据 + 纯函数，不认识 three，也不认识 React。
//
// 三条设计边界（见 docs/equipment-plan.md）：
// 1. 机翼回答「怎么打穿 Boss 弱点」，装备回答「怎么活下来、怎么看得爽」。
//    所以僚机弹带 chipOnly，永远只按弱点 chip 结算；effectiveDps / bossHp 一行不动。
// 2. 装备走自己的成长轴：捡同型号 → 编队数 1→3，不叫阶级、不放相位冲击。
// 3. 装备不进存档，只在本局内跨关 carry；掉命掉一级，重试本章清空。
//
// 停机位一律挂在主机**后侧**（y 更大 = 更靠近屏幕下方）：翼展 12.8 格既是判定宽度
// 也是看到的宽度，停着的时候两侧挂僚机会把它撑破。
// 但僚机不是钉死在尾巴上的炮台：有目标时按本型 formation 展开——
// E1 左右侧翼、E2 前方游猎、E3 绕主机环绕——没目标就一起回后方停机位。
// 走位是时间的纯函数（不存状态），跨关 carry、复活、重试都不用多搬一份「僚机在哪」。
//
// 走位只改「在哪打」，不改「打多疼」：弹数仍等于编队数、仍带 chipOnly，
// 生成时 |vx| 仍压在 40 以下（打不进 side 弱点），effectiveDps / bossHp 一行不动。
// 唯一的例外是 E2 的巡航导弹会逐帧转向（steerHoming），转向后横速可能变大，
// 但 chipOnly 让 Boss 命中在 bossShotMultiplier 里直接短路到 chip，配平不受影响。

import { FIELD_H, FIELD_W, WING_HALF_W } from './rules.js';

/** 编队上限。三架就是「一整支小队」，再多屏幕上会糊成一团。 */
export const MAX_FORMATION = 3;
/** 替主机挡下致命一击之后的一小段无敌：挡完了还得有机会拉开。 */
export const GEAR_BLOCK_INVULN = 1.15;
/** 编队满员还捡到同型号：换成一笔分，不能白捡。 */
export const GEAR_FULL_SCORE = 180;

// ——— 自主索敌 ———
/** 一轮「前出 → 咬住 → 回防」的周期（秒）。每架错相，画面上是轮流散开，不是整队瞬移。 */
export const ESCORT_SORTIE_PERIOD = 4.4;
/** 最多前出到主机前方多少格：再远就成了独立战机，替主机挡弹这件事也说不圆。 */
export const ESCORT_SORTIE_REACH = 30;
/** 横向最多离开主机多少格：留得住在同一屏里，也留得住「这是一支护卫小队」。 */
export const ESCORT_SORTIE_SPAN = 34;
// 三型各走各的伴飞阵型，别让「换个装备」只换颜色：
// E1 左右侧翼、E2 前方游猎、E3 绕主机环绕；没目标时一起回后侧停机位。
// 11 格那一版实拍里侧翼正好压在机翼尖端，斜俯视下看着仍像「挂在尾巴上」；
// 拉到 18 / 15 才真的分列左右、绕得开一圈，活动半径（34 格）仍罩得住。
export const ESCORT_FLANK_SPAN = 18;
export const ESCORT_ORBIT_R = 15;
export const ESCORT_ORBIT_SPEED = 1.35; // rad/s
/** 巡航导弹的转向速率（rad/s）。封顶才有「追」的过程，不是瞬间贴脸。 */
export const HOMING_TURN = 3.2;

const clampValue = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t * t * (3 - 2 * t);

/**
 * 巡航导弹：每帧朝目标转一点点，速度大小保持不变。
 * 纯函数，判定层自己就能测；转到目标背后会绕回来，不会原地抖动。
 */
export function steerHoming(shot, point, dt) {
  const speed = Math.hypot(shot.vx, shot.vy) || 1;
  const now = Math.atan2(shot.vy, shot.vx);
  const want = Math.atan2(point.y - shot.y, point.x - shot.x);
  const delta = ((want - now + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const turn = clampValue(delta, -HOMING_TURN * dt, HOMING_TURN * dt);
  const angle = now + turn;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/**
 * 0（守在护卫位）→ 1（前出到索敌位）→ 0。
 * 用连续三角波而不是开关：位置是时间的连续函数，表现层的插值跟随才不会打架。
 */
export function escortSortie(time, index, count) {
  const offset = (index / Math.max(1, count)) * 0.62;
  const phase = ((time / ESCORT_SORTIE_PERIOD + offset) % 1 + 1) % 1;
  const rise = ease(clampValue(phase / 0.2, 0, 1));
  const fall = ease(clampValue((0.78 - phase) / 0.2, 0, 1));
  return Math.min(rise, fall);
}

/**
 * 这一帧僚机该盯着谁（纯函数，判定层与表现层共用同一份，免得两边算出不同位置）。
 * Boss 优先，其余按「离玩家最近」排；只认主机上方的目标，身后的不管。
 * 没有目标时返回空 targets，escortsOf 会自动退回停机位。
 */
export function escortWorld(state) {
  const ship = state?.ship;
  if (!ship) return { time: 0, targets: [] };
  const targets = [];
  const boss = state.boss;
  if (boss && !boss.entering && !boss.dying) {
    targets.push({ x: boss.x, y: boss.y, kind: 'boss' });
  }
  for (const enemy of state.enemies ?? []) {
    if (!enemy || enemy.hp <= 0) continue;
    if (enemy.y >= ship.y - 6) continue;
    targets.push({ x: enemy.x, y: enemy.y, kind: enemy.kind ?? 'zako' });
  }
  const rank = (t) => (t.kind === 'boss' ? 1 : 0);
  targets.sort((a, b) =>
    rank(b) - rank(a) ||
    b.y - a.y ||
    Math.abs(a.x - ship.x) - Math.abs(b.x - ship.x));
  return { time: state.elapsed ?? state.time ?? 0, targets };
}

/**
 * 三型僚机，一型一形一色。layouts[0..2] 分别是编队数 1/2/3 时的**停机位**坐标，
 * 每项 [dx, dy] 是相对主机的场地格偏移；|dx| 必须留在 WING_HALF_W 之内。
 * 有目标时 escortsOf(ship, world) 会把停机位平滑推向索敌位，走位参数在上面那组常量里。
 * **单架停机时也不站正后方**：dx 给一个偏左的错位，否则僚机弹与主机直射弹走同一条线，
 * 加色叠在一起全变成白色，玩家会以为「僚机没有子弹」（实机截图里报过的问题）。
 * fire.spread 不是「每架发两发」，是每架交替往左右偏一点——弹数恒等于编队数，
 * 免得装备火力随型号膨胀，把弱点惩罚稀释掉。
 */
export const GEAR = {
  E1: {
    code: 'E1',
    name: '雁翎',
    kind: 'escort',
    title: '索敌僚机',
    desc: '一对细长的雁翼，轮番前出咬住敌舰',
    use: '火力最稳，近身消弹半径居中',
    hue: 190,
    shape: 'swept',
    formation: 'flank',
    layouts: [
      [[-3.0, 14.5]],
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
    title: '游猎僚机',
    desc: '两支前掠梭翼，分头追着不同目标偏射',
    use: '射得最勤，消弹圈最小',
    hue: 300,
    shape: 'needle',
    formation: 'sortie',
    layouts: [
      [[-2.8, 13.6]],
      [[-4.9, 14.6], [4.9, 14.6]],
      [[-4.9, 14.6], [4.9, 14.6], [0, 19.4]],
    ],
    // 只有游猎僚机带巡航导弹：多一路追踪就多一路观赏，但别让三型全变成同一种弹。
    fire: { dmg: 0.42, cool: 0.38, vx: 0, vy: -92, spread: 18, life: 1.5, homing: true },
    aura: 2.3,
  },
  E3: {
    code: 'E3',
    name: '环哨',
    kind: 'escort',
    title: '哨戒僚机',
    desc: '环形护翼，前出索敌也拖着一圈消弹场',
    use: '火力最弱，消弹圈最大',
    hue: 50,
    shape: 'ring',
    formation: 'orbit',
    layouts: [
      [[-2.6, 12.6]],
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

/** 僚机自身半宽（模型 Box3 实测上限，含翼尖灯）。 */
export const ESCORT_HALF_W = 1.3;

/** 停机位：挂在主机后侧，整体不越出 12.8 格判定翼展。 */
function escortHome(ship) {
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

/**
 * 一型一种伴飞位（纯函数，位置是时间的连续函数，不存状态）：
 * - flank  左右侧翼：交替分列主机两侧，随目标方向整体倾斜，轻微前后摆动；
 * - sortie 前方游猎：周期性前出，横向对齐目标、纵向最多前出 REACH 格，再回防；
 * - orbit  环绕：绕主机等分相位转圈，消弹圈最大，扫过整片近身弹幕。
 * 三型都带一点朝目标的偏移，所以「自动找敌舰」这件事在每种阵型里都读得出来。
 */
function escortPost(ship, base, spec, target, count, time) {
  // 朝目标只给一点点倾斜：倾太多会把另一侧翼拉回机翼范围内，
  // 三型就都挤在主机同一边，看不出「左右伴飞」。
  const lean = clampValue((target.x - ship.x) * 0.08, -3, 3);
  if (spec.formation === 'flank') {
    const side = base.index % 2 === 0 ? -1 : 1;
    const wave = Math.sin(time * 1.7 + base.index * 1.3);
    return {
      x: ship.x + side * (ESCORT_FLANK_SPAN + wave * 1.4) + lean,
      y: ship.y - 3 + Math.cos(time * 1.1 + base.index) * 3.4,
    };
  }
  if (spec.formation === 'orbit') {
    const angle = time * ESCORT_ORBIT_SPEED + (base.index / count) * Math.PI * 2;
    return {
      x: ship.x + Math.cos(angle) * ESCORT_ORBIT_R + lean * 0.5,
      y: ship.y + Math.sin(angle) * ESCORT_ORBIT_R * 0.62 - 3,
    };
  }
  const stagger = (base.index - (count - 1) / 2) * 7;
  return {
    x: clampValue(target.x + stagger, ship.x - ESCORT_SORTIE_SPAN, ship.x + ESCORT_SORTIE_SPAN),
    y: clampValue(
      Math.min(ship.y - 8, target.y + 14),
      ship.y - ESCORT_SORTIE_REACH,
      FIELD_H - 5,
    ),
  };
}

/**
 * 当前编队的世界坐标（纯函数，表现层与消弹判定都读这一份）。
 * 不进 hitBoxes：僚机不吃伤害，否则「带翼更容易被打中」这条教学被稀释。
 *
 * 不传 world = 停机位（挂在主机**后侧**，选翼面板、HUD、旧测试都读这一份）；
 * 传 world = 按本型 formation 展开到伴飞位。没有目标时一律回停机位，
 * 所以四种站位都齐了：后方（停机）、左右（E1）、前方（E2）、环绕（E3）。
 */
export function escortsOf(ship, world = null) {
  const home = escortHome(ship);
  const targets = world?.targets ?? [];
  if (!home.length || !targets.length) return home;
  const spec = gearSpec(ship.gear);
  const count = home.length;
  const time = world?.time ?? 0;
  return home.map((base) => {
    // 侧翼与环绕是常驻阵型，游猎才有「前出 / 回防」的节奏，三型因此各有各的动法。
    const blend = spec.formation === 'sortie' ? escortSortie(time, base.index, count) : 1;
    if (blend <= 0) return base;
    const target = targets[base.index % targets.length];
    const post = escortPost(ship, base, spec, target, count, time);
    return {
      ...base,
      x: clampValue(base.x + (post.x - base.x) * blend, ESCORT_HALF_W + 2, FIELD_W - ESCORT_HALF_W - 2),
      y: clampValue(base.y + (post.y - base.y) * blend, 8, FIELD_H - 5),
      target: { x: target.x, y: target.y, kind: target.kind },
      formation: spec.formation,
      sortie: blend,
    };
  });
}

/** 停机位不许越出判定翼展（含僚机自己的半宽与光晕）。 */
export const escortWithinSpan = (ship) =>
  escortsOf(ship).every((escort) => Math.abs(escort.x - ship.x) + ESCORT_HALF_W <= WING_HALF_W);

/** 出击位不许飞出场地，也不许甩出主机周围那一屏。 */
export const escortWithinField = (ship, world) =>
  escortsOf(ship, world).every((escort) =>
    escort.x >= ESCORT_HALF_W && escort.x <= FIELD_W - ESCORT_HALF_W &&
    escort.y >= 8 && escort.y <= FIELD_H - 5 &&
    Math.abs(escort.x - ship.x) <= ESCORT_SORTIE_SPAN + ESCORT_HALF_W + 2 &&
    escort.y >= ship.y - ESCORT_SORTIE_REACH - 2);

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
export function gearVolley(ship, nextId = 1, world = null) {
  const spec = gearSpec(ship?.gear);
  if (!spec || clampFormation(ship.gearLevel) < 1) return { shots: [], nextId };
  const shots = [];
  const targets = world?.targets ?? [];
  let id = nextId;
  for (const escort of escortsOf(ship, world)) {
    // 交替偏射，且 |vx| 故意压在 40 以下：侧向弱点要 |vx| > 40，
    // 僚机弹不该「碰巧」打进任何装甲弱点。
    const bias = spec.fire.spread ? (escort.index % 2 === 0 ? 1 : -1) * spec.fire.spread : 0;
    // 走位已经把僚机摆到目标下方，这里只补一点方位修正，让弹道读起来是「追着敌舰打」
    // 而不是「碰巧从下面飘过去」。修正量封顶 ±26，叠加 spread 后仍 clamp 到 ±36。
    const target = targets.length ? targets[escort.index % targets.length] : null;
    const aimVx = target ? clampValue((target.x - escort.x) * 0.85, -26, 26) : 0;
    shots.push({
      id,
      x: escort.x,
      y: escort.y - 2.2,
      vx: clampValue((spec.fire.vx ?? 0) + bias + aimVx, -36, 36),
      vy: spec.fire.vy,
      dmg: spec.fire.dmg,
      kind: 'escort',
      source: 'gear',
      chipOnly: true,
      // 只有游猎僚机的弹会逐帧转向（见 simulation.js 的 steerHoming）。
      // 转向后横速可能变大，但 chipOnly 让 Boss 命中一律短路到 chip，碰不进侧面弱点。
      homing: Boolean(spec.fire.homing),
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
