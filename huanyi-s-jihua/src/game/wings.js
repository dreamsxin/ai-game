// 机翼系统：这游戏的灵魂。
//
// 每种机翼是一套完整的火力配置，不是「更强的枪」。10 种常规机翼在这里是数据，
// 火力形状（几路、往哪飞、多快冷却）全部写在 volley 里，simulation 只负责按冷却复制模板。
//
// 更要紧的是 damageMultiplier：Boss 的弱点决定哪种机翼「打得进去」。
// 选错机翼不是慢一点，是外壳挡掉七成伤害——所以关卡开始前那一次选择才有重量。

const RAD = Math.PI / 180;

/** 按角度和速度算出一发子弹的速度分量。0 度朝上（纵版射击里屏幕上方是前方）。 */
const aim = (deg, speed) => ({ vx: Math.sin(deg * RAD) * speed, vy: -Math.cos(deg * RAD) * speed });

const bolt = (dx, deg, speed, dmg, extra = {}) => ({ dx, dy: -3, dmg, kind: 'bolt', life: 2.4, ...aim(deg, speed), ...extra });

/**
 * 机翼表。
 * - cool：一轮火力的冷却，越小越密。密度不只是 DPS，还是「能不能把敌弹打掉」的能力。
 * - volley：一轮里同时射出的子弹模板，dx/dy 是相对主机的出膛位置。
 * - orbs：绕着主机转的铁球数量，由 simulation 持续维护，不吃冷却。
 * - pierce: 'armor' 能穿装甲打到内部弱点，'targets' 只是能连穿几个敌人。
 */
export const WINGS = {
  C: {
    code: 'C',
    name: '加农炮',
    desc: '两路高速直射，射速最快、火力最猛',
    use: '通用首选，也是压弹幕最稳的一套',
    cool: 0.085,
    volley: [bolt(-2.4, 0, 118, 2), bolt(2.4, 0, 118, 2)],
  },
  W: {
    code: 'W',
    name: '宽幅炮',
    desc: '5 路扇形散射，横向覆盖最广',
    use: '清密集小兵，也能扫到侧面弱点',
    cool: 0.2,
    volley: [
      bolt(-1.8, -38, 94, 1),
      bolt(-1.2, -19, 96, 1),
      bolt(0, 0, 98, 1),
      bolt(1.2, 19, 96, 1),
      bolt(1.8, 38, 94, 1),
    ],
  },
  M: {
    code: 'M',
    name: '排炮',
    desc: '3 路平行射击，覆盖比加农宽',
    use: '中距离对群，走位不用太精细',
    cool: 0.15,
    volley: [bolt(-5.4, 0, 104, 1.6), bolt(0, 0, 104, 1.6), bolt(5.4, 0, 104, 1.6)],
  },
  V: {
    code: 'V',
    name: '防卫炮',
    desc: '正面 180° 弹幕，射程极短',
    use: '专打贴脸的小子弹，射程外等于没有',
    cool: 0.06,
    volley: [
      bolt(-2, -72, 72, 0.6, { kind: 'short', life: 0.3 }),
      bolt(0, 0, 76, 0.6, { kind: 'short', life: 0.3 }),
      bolt(2, 72, 72, 0.6, { kind: 'short', life: 0.3 }),
    ],
  },
  S: {
    code: 'S',
    name: '三向炮',
    desc: '正前加左右同时开火',
    use: '打侧面弱点，能站在安全距离外',
    cool: 0.17,
    volley: [bolt(0, 0, 104, 2), bolt(-4.6, -78, 100, 1.6), bolt(4.6, 78, 100, 1.6)],
  },
  A: {
    code: 'A',
    name: '前后炮',
    desc: '前后双向射击',
    use: '应付从后方绕上来的敌机',
    cool: 0.13,
    volley: [bolt(-1.6, 0, 106, 1.8), bolt(1.6, 180, 100, 1.8)],
  },
  H: {
    code: 'H',
    name: '铁球炮',
    desc: '前方两路，外加两枚绕机自转的铁球',
    use: '攻守兼备，贴身的东西自己会没',
    cool: 0.17,
    orbs: 2,
    volley: [bolt(-2.6, -6, 100, 1.4), bolt(2.6, 6, 100, 1.4)],
  },
  J: {
    code: 'J',
    name: '穿甲弹',
    desc: '穿透装甲后在内部爆开，射速很慢',
    use: '唯一能打进「壳里有核」的那种 Boss',
    cool: 0.3,
    volley: [bolt(0, 0, 96, 4.2, { kind: 'pierce', pierce: 'armor', blast: 2.2, life: 2.6 })],
  },
  F: {
    code: 'F',
    name: '火焰炮',
    desc: '喷射火焰柱，一发能连穿几个目标',
    use: '对直线排列的敌人，近距离伤害极高',
    cool: 0.045,
    volley: [bolt(0, 0, 66, 0.85, { kind: 'flame', pierce: 'targets', life: 0.34 })],
  },
  D: {
    code: 'D',
    name: '对地机翼',
    desc: '一路直射，外加两枚落向低空的炸弹',
    use: '贴地的堡垒只吃这一种',
    cool: 0.15,
    volley: [
      bolt(0, 0, 100, 1),
      bolt(-3.4, -4, 58, 2, { kind: 'bomb', ground: true, life: 2.4 }),
      bolt(3.4, 4, 58, 2, { kind: 'bomb', ground: true, life: 2.4 }),
    ],
  },
  SS: {
    code: 'SS',
    name: 'SS 机翼',
    desc: '四向穿甲加两枚铁球，秘密机翼',
    use: '后期极低概率掉落，被玩家叫做「无解」',
    secret: true,
    cool: 0.1,
    orbs: 2,
    volley: [
      bolt(0, 0, 110, 2.2, { kind: 'pierce', pierce: 'armor', life: 2.4 }),
      bolt(-3, -90, 104, 2.2, { kind: 'pierce', pierce: 'armor', life: 2.4 }),
      bolt(3, 90, 104, 2.2, { kind: 'pierce', pierce: 'armor', life: 2.4 }),
      bolt(0, 180, 104, 2.2, { kind: 'pierce', pierce: 'armor', life: 2.4 }),
    ],
  },

  // ——— 实验机翼 ———
  //
  // 后半程解锁的另一条路。它们不是「更强的常规机翼」——对付带装甲的 Boss 反而慢，
  // 因为四种弱点的答案仍然只在常规十种里。它们强在另一根轴上：清弹幕、扫编队、覆盖面。
  // 这游戏一半的压力来自敌弹，所以「把弹幕吃掉」本身就是一种解法。
  G: {
    code: 'G',
    name: '引力井',
    desc: '射出一口缓慢的引力井，把附近的敌弹吸进去湮灭',
    use: '正面强行开路：弹幕再密也能凿出一条缝',
    lab: true,
    cool: 0.55,
    volley: [bolt(0, 0, 38, 0.5, { kind: 'well', well: 11, life: 2.6 })],
  },
  Z: {
    code: 'Z',
    name: '链弧炮',
    desc: '命中后电弧会跳到旁边的敌人身上',
    use: '编队越密，一发打掉的越多',
    lab: true,
    cool: 0.16,
    volley: [bolt(0, 0, 108, 1.6, { kind: 'arc', chain: 2, chainR: 17, chainFall: 0.6 })],
  },
  L: {
    code: 'L',
    name: '相位激光',
    desc: '极高射速的细束光，一发连穿整列敌人',
    use: '直线火力最强，但完全没有横向覆盖',
    lab: true,
    cool: 0.05,
    volley: [bolt(0, 0, 190, 0.9, { kind: 'beam', pierce: 'targets', life: 0.9 })],
  },
  X: {
    code: 'X',
    name: '反物质弹',
    desc: '一发慢速重弹，命中或耗尽时炸成一圈碎片',
    use: '一发管一片，但打出去就得等下一发',
    lab: true,
    cool: 0.5,
    volley: [bolt(0, 0, 62, 3, { kind: 'anti', burst: 8, burstDmg: 1.2, life: 1.4 })],
  },
  Q: {
    code: 'Q',
    name: '量子分身',
    desc: '在场地另一侧投出一个镜像分身，同步开火',
    use: '一个人管两条线，顾不到的那一半交给分身',
    lab: true,
    echo: true,
    cool: 0.14,
    volley: [bolt(-2, 0, 104, 1.5), bolt(2, 0, 104, 1.5)],
  },
};

/** 关卡开始前能选的 10 种常规机翼。 */
export const WING_CODES = Object.keys(WINGS).filter((code) => !WINGS[code].secret && !WINGS[code].lab);
/** 实验机翼：第 3 章起才出现在选单和运载火箭里。 */
export const LAB_CODES = Object.keys(WINGS).filter((code) => WINGS[code].lab);
export const SECRET_CODES = Object.keys(WINGS).filter((code) => WINGS[code].secret);
export const ALL_CODES = Object.keys(WINGS);
/** 选得到的全部（不含秘密机翼）。平衡不变式按这一份校验。 */
export const PICKABLE_CODES = [...WING_CODES, ...LAB_CODES];

// 实验机翼从第 3 章（第 9 关）解锁。前两章只有常规十种，先把基本盘学会。
export const LAB_CHAPTER = 2;

/** 某一章能选的机翼。 */
export const codesFor = (chapter = 0) =>
  chapter >= LAB_CHAPTER ? PICKABLE_CODES : WING_CODES;

export const wingAt = (code) => WINGS[code] ?? null;

// ——— 进化 ———
//
// 捡到和手上同型号的机翼就升一阶：冷却更短、每发更重，Mk.III 还多一枚铁球。
// 三条约束让进化不至于毁掉别的设计：
// 1. 阶级只乘伤害，不改 pierce/ground/vx，所以 chip 倍率照旧——进化不能把选错的机翼变成对的。
// 2. 阶级跟着机翼走，不跟着人走：弃翼时脱落的道具带着阶级，接回来还在，飘走就白攒了。
// 3. 掉命只把机翼还原成这一关带进来的那只（Mk.I），攒下来的阶级是真会没的。
export const MAX_TIER = 3;

export const TIERS = [
  { tier: 1, name: 'Mk.I', dmg: 1, cool: 1, mark: 'I' },
  { tier: 2, name: 'Mk.II', dmg: 1.25, cool: 0.88, mark: 'II' },
  { tier: 3, name: 'Mk.III', dmg: 1.55, cool: 0.78, mark: 'III' },
];

export const clampTier = (tier = 1) => Math.min(MAX_TIER, Math.max(1, Math.round(tier)));

export const tierOf = (tier = 1) => TIERS[clampTier(tier) - 1];

/**
 * 把机翼和阶级合成成一份「这一刻真正在用的火力配置」。
 * simulation 只认这个函数的结果，所以进化不需要在开火逻辑里再判一次。
 */
export function wingAtTier(code, tier = 1) {
  const wing = WINGS[code];
  if (!wing) return null;
  const step = tierOf(tier);
  return {
    ...wing,
    tier: step.tier,
    tierName: step.name,
    tierMark: step.mark,
    cool: wing.cool * step.cool,
    // Mk.III 给带铁球的机翼多挂一枚：进化要看得见，不能只是数字变大。
    orbs: wing.orbs ? wing.orbs + (step.tier === MAX_TIER ? 1 : 0) : 0,
    volley: wing.volley.map((shot) => ({ ...shot, dmg: shot.dmg * step.dmg })),
  };
}

/**
 * Boss 的弱点类型。每一种都在问同一个问题：你带的机翼能把伤害送到该去的地方吗？
 * hint 是关卡开始前给玩家的情报，keys 是真能打进去的机翼——两者必须对得上，
 * 否则情报就是骗人的（levels.test.js 守着这条）。
 */
export const WEAKNESS = {
  core: { label: '弱点在壳内正中', hint: '外层装甲挡住一切，除了能穿进去的', chip: 0.16, keys: ['J', 'SS'] },
  side: { label: '弱点在两侧炮座', hint: '正面打不到，要从侧向送进去', chip: 0.2, keys: ['S', 'W', 'SS'] },
  low: { label: '弱点贴在地面', hint: '平射会从它头上飞过去', chip: 0.16, keys: ['D'] },
  swarm: { label: '生物体，没有装甲', hint: '哪儿都能打穿，问题是它的弹幕', chip: 1, keys: ALL_CODES },
};

export const WEAKNESS_KINDS = Object.keys(WEAKNESS);

/** 这一发子弹算不算「打进去了」。侧向判定看横向速度，不看是哪种机翼。 */
export function reachesWeakness(kind, bullet) {
  if (kind === 'swarm') return true;
  if (kind === 'core') return bullet.pierce === 'armor';
  if (kind === 'low') return Boolean(bullet.ground);
  if (kind === 'side') return Math.abs(bullet.vx ?? 0) > 40;
  return true;
}

/**
 * 伤害倍率。打进弱点是 1，打在装甲上只剩 chip。
 * Boss 血量是按 1 倍率配的，所以拿错机翼会从「一场仗」变成「一场消耗」——这是设计，不是数值失衡。
 */
export const damageMultiplier = (kind, bullet) =>
  reachesWeakness(kind, bullet) ? 1 : (WEAKNESS[kind]?.chip ?? 1);

/** 命中反馈只分两种：打进去了，还是被壳挡住了。音效靠这个区分「有进展」和「白打」。 */
export const hitKind = (kind, bullet) => (reachesWeakness(kind, bullet) ? 'pierce' : 'chip');

/** 关卡情报里推荐的机翼。只推常规十种：实验机翼是另一条路，不是标准答案。 */
export const recommendedWing = (kind) =>
  (WEAKNESS[kind]?.keys ?? []).find((code) => WING_CODES.includes(code)) ?? 'C';

/** 一轮火力的伤害总量除以冷却，用来给「火力密度」排序。 */
export const dps = (code, tier = 1) => {
  const wing = wingAtTier(code, tier);
  if (!wing) return 0;
  const perVolley = wing.volley.reduce((sum, shot) => sum + shot.dmg, 0);
  return perVolley / wing.cool;
};

// Boss 战的常规交火距离。射程不够的火力要贴到脸上才生效，估算 DPS 时得按这个折价，
// 否则防卫炮这种「0.3 秒就消失」的弹幕会在纸面上强得离谱。
const BOSS_RANGE = 30;
const reachOf = (shot) => Math.hypot(shot.vx, shot.vy) * shot.life;
const rangeFactor = (shot) => Math.min(1, reachOf(shot) / BOSS_RANGE);

/**
 * 某种机翼打某种弱点的有效 DPS。这是配 Boss 血量的唯一依据：
 * levels.js 用「推荐机翼的有效 DPS × 目标时长」反推血量，
 * 于是「选对了打十几秒、选错了打一分钟」这句话由算式保证，不靠手调数字。
 *
 * 注意这里只算「打在同一个 Boss 身上」的部分：量子分身的镜像火力打的是场地另一侧，
 * 链弧的跳弹打的是旁边的杂兵，都不该记在这笔账上。所以对实验机翼它是个下限，不是上限。
 */
export const effectiveDps = (code, kind, tier = 1) => {
  const wing = wingAtTier(code, tier);
  if (!wing) return 0;
  const total = wing.volley.reduce(
    (sum, shot) => sum + shot.dmg * damageMultiplier(kind, shot) * rangeFactor(shot),
    0,
  );
  return total / wing.cool;
};
