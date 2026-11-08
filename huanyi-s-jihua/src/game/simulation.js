// 固定步长的状态机。这是游戏本体，不碰 DOM，也不认识 React。
//
// 一局的形状：ready → select（每章第一关才有）→ playing → clear → 下一关 → … → won。
// 每一帧的 effects 数组是逻辑层和表现层唯一的通信通道：渲染、音效、震动都只读它。
//
// 三条规则决定了这游戏的手感，全部落在 step 里：
// 1. 机翼既是火力也是装甲。带着翼被打中只掉翼，裸机被打中才掉命。
// 2. 弃翼换来 1.05 秒无敌和一截加速，代价是这段时间只剩主机小炮。
// 3. 敌弹有血量，能被打掉——所以火力密度同时是攻击力和防御力。

import {
  CATCH_R,
  CATCH_GRACE,
  BOSS_SCORE,
  BOSS_DEATH_TIME,
  BOSS_BLAST_EVERY,
  CHAPTER_LIFE_BONUS,
  DIVE_BOOST,
  DIVE_TIME,
  EVOLVE_SCORE,
  FIELD_H,
  FIELD_W,
  GEAR_CATCH_SCORE,
  GEAR_DRIFT,
  GEAR_DRIFT_VY,
  GEAR_DROP_LIFE,
  GEAR_DROP_VY,
  GEAR_SYNC_SCORE,
  HULL_GUN,
  HULL_HALF_H,
  HULL_HALF_W,
  HURT_INVULN,
  JETTISON_LOCK,
  LIFE_BONUS,
  MAX_LIVES,
  OVERDRIVE_SCORE,
  OVERDRIVE_TIME,
  PLAYER_MAX_Y,
  PLAYER_MIN_Y,
  PLAYER_SPEED,
  PLAYER_Y,
  RESPAWN_DELAY,
  SYNC_BURST_INVULN,
  SYNC_BURST_R,
  WELL_KILL,
  WELL_PULL,
  SKIP_SCORE,
  START_LIVES,
  WING_DRIFT,
  WING_DRIFT_VY,
  WING_HALF_H,
  WING_HALF_W,
  clamp,
  popScore,
  resultStars,
  tuning,
} from './rules.js';
import { EMPTY_INPUT } from './input.js';
import { LEVELS, bossAt, canSelect, chapterStart, levelAt, skipTarget } from './levels.js';
import { MAX_TIER, WEAKNESS, WINGS, clampTier, damageMultiplier, hitKind, wingAtTier } from './wings.js';
import {
  GEAR_BLOCK_INVULN,
  GEAR_FULL_SCORE,
  gearAfterBlock,
  gearAfterLoss,
  gearFields,
  gearPick,
  gearSpec,
  gearVolley,
  escortWorld,
  escortsOf,
  steerHoming,
} from './gear.js';
import { offField, spawnWave, stepEnemy, stepShot } from './enemies.js';
import { makeBoss, stepBoss } from './boss.js';
import { createRandom } from './random.js';

export { EMPTY_INPUT };
export const STEP = 1 / 60;

/**
 * Boss 命中倍率。装备弹带 chipOnly，一律只按弱点 chip 结算——
 * 单独拎出来是为了让这条约定能被测试直接指着断言，而不是埋在 step 的大循环里。
 */
export const bossShotMultiplier = (weak, shot) =>
  shot.chipOnly ? (WEAKNESS[weak]?.chip ?? 1) : damageMultiplier(weak, shot);

// 跳关门的出现窗口：最后一波清完 3 秒后开门，Boss 出场前关门。
const GATE_LEAD = 3;
const GATE_SPEED = 22;
const ORB_R = 2.6;
const ORB_DPS = 7;
const ORB_DIST = 9.5;

const makeShip = (wing, tier = 1, gear = null) => ({
  x: FIELD_W / 2,
  y: PLAYER_Y,
  wing: wing ?? null,
  // 机翼的阶级。它跟着机翼走，不跟着人走——弃翼脱落的道具带着它一起飞出去。
  tier: wing ? clampTier(tier) : 1,
  cool: 0,
  invuln: 1.2,
  dive: 0,
  lock: 0,
  orbAngle: 0,
  // 相位过载是满阶之后再叠同型号换来的限时增益，不写进阶级（弃翼／换翼／掉翼都清零）。
  overdrive: 0,
  // 第二槽：装备只在本局内跨关 carry，不进 progress.js 的存档。
  ...gearFields(gear),
});

/** 载入一关。carry 带着上一关的战果：命、分、以及还挂在机上的那只翅膀。 */
function loadLevel(index, carry = {}) {
  const level = levelAt(index);
  const tune = tuning(index);
  return {
    status: carry.status ?? (canSelect(index) ? 'select' : 'playing'),
    levelIndex: index,
    levelKey: level.key,
    levelName: level.name,
    chapter: level.chapter,
    weak: level.boss.weak,
    bossName: level.boss.name,
    time: 0,
    elapsed: carry.elapsed ?? 0,
    tune,
    // 进这一关时挂的那只翅膀。复活按它还原：掉命已经够疼了，
    // 再让人裸机重开就变成死亡螺旋——「这一关带什么翅膀」才是这游戏要玩家反复回答的问题。
    entryWing: carry.wing ?? null,
    seed: 1013 + index * 7919,
    waveIndex: 0,
    ship: makeShip(carry.wing ?? null, carry.tier ?? 1, carry.gear ?? null),
    drops: [],
    shots: [],
    foes: [],
    enemies: [],
    boss: null,
    gate: null,
    skipped: false,
    reviveTimer: 0,
    lives: carry.lives ?? START_LIVES,
    score: carry.score ?? 0,
    // 进本章时的分数。失败重试要把分退回到这里，否则重打同一关就能刷纪录。
    baseScore: carry.baseScore ?? carry.score ?? 0,
    chain: 0,
    bestChain: carry.bestChain ?? 0,
    pops: carry.pops ?? 0,
    kills: carry.kills ?? 0,
    // 战报要用的两个数：掉翼几次、总共挨了几下。没有它们，
    // 「我到底是被弹幕磨死的还是自己浪死的」只能靠回忆。
    wingLosses: carry.wingLosses ?? 0,
    hits: carry.hits ?? 0,
    // 这一章重试过几次。不惩罚，只是让结算面板说实话。
    retried: carry.retried ?? 0,
    stars: 0,
    nextId: 1,
    effects: [],
  };
}

export const createGame = (levelIndex = 0) => ({ ...loadLevel(levelIndex), status: 'ready' });

/**
 * 开一关。给了 wing 就是「选择已经做完了」，直接开打；不给就按关卡规则决定要不要进选翼界面。
 * advance 进到每章第一关时不走这里，所以那几关一定会再问一次「这一关带什么翅膀」。
 */
export const startGame = (levelIndex = 0, wing = null, gearCode = null) => {
  const gear = gearSpec(gearCode) ? { code: gearCode, level: 1, guard: true } : null;
  const state = loadLevel(levelIndex, { wing, gear });
  return wing ? { ...state, status: 'playing' } : state;
};

export const togglePause = (state) => {
  if (state.status === 'playing') return { ...state, status: 'paused', effects: [] };
  if (state.status === 'paused') return { ...state, status: 'playing', effects: [] };
  return state;
};

/** 选翼界面按下某一种机翼。只有 select 状态接受这个动作。第三个参数是同一面板上预带的装备。 */
export function chooseWing(state, code, gearCode = null) {
  if (state.status !== 'select' || !WINGS[code]) return state;
  const picked = gearSpec(gearCode) ? gearPick({ gear: null }, gearCode) : null;
  const effects = [{ type: 'catch', code }];
  if (picked) effects.push({ type: 'gearCatch', code: gearCode, level: picked.fields.gearLevel, preset: true });
  return {
    ...state,
    status: 'playing',
    ship: {
      ...state.ship,
      wing: code,
      tier: 1,
      overdrive: 0,
      ...(picked ? picked.fields : {}),
    },
    entryWing: code,
    effects,
  };
}

/**
 * 打完一关往下走。skipped 决定是 +1 还是跳 4 关。
 * 跨章时补一条命（上限 MAX_LIVES）：这一条是给「打到第 13 关死在 Boss 手上」的人留的续气，
 * 不是难度开关——敌人强度、Boss 血量一点都没动。
 */
export function advance(state) {
  if (state.status !== 'clear') return state;
  const next = state.skipped ? skipTarget(state.levelIndex) : state.levelIndex + 1;
  if (next >= LEVELS.length) {
    // 通关结算：剩下的命折成分。留着命通关比擦着边通关更值钱。
    const finished = { ...state, status: 'won', score: state.score + state.lives * LIFE_BONUS };
    return { ...finished, stars: resultStars(finished), effects: [] };
  }
  const crossing = levelAt(next).chapter !== state.chapter;
  const carry = {
    wing: state.ship.wing,
    tier: state.ship.tier,
    // 装备跟着编队一起过下一关，但不进存档：关掉网页就没了。
    gear: state.ship.gear
      ? { code: state.ship.gear, level: state.ship.gearLevel, guard: state.ship.gearGuard }
      : null,
    lives: crossing ? Math.min(MAX_LIVES, state.lives + CHAPTER_LIFE_BONUS) : state.lives,
    score: state.score,
    // 进新章时把「本章起点分」抬到当前分：这一章的失败重试只回到这里，刷不出新纪录。
    baseScore: crossing ? state.score : state.baseScore,
    bestChain: state.bestChain,
    pops: state.pops,
    kills: state.kills,
    elapsed: state.elapsed,
    wingLosses: state.wingLosses ?? 0,
    hits: state.hits ?? 0,
    retried: state.retried ?? 0,
  };
  return loadLevel(next, carry);
}

/**
 * 失败后从本章第一关重来。三条约束让「重试」不等于「白送」：
 * 1. 分数退回进本章时的起点——重打同一关刷不出新纪录；
 * 2. 命重置成开局那三条，机翼与攒下的阶级一起作废，得重新选一次火力；
 * 3. 总用时继续累计，结算面板里看得出来这一章是重试过的。
 */
export function retryChapter(state) {
  const start = chapterStart(state.levelIndex);
  // 不带 gear：重试本章时整槽装备作废，比掉命「掉一级」更重一档。
  return loadLevel(start, {
    wing: null,
    lives: START_LIVES,
    score: state.baseScore ?? 0,
    baseScore: state.baseScore ?? 0,
    bestChain: state.bestChain ?? 0,
    pops: state.pops ?? 0,
    kills: state.kills ?? 0,
    elapsed: state.elapsed ?? 0,
    wingLosses: state.wingLosses ?? 0,
    hits: state.hits ?? 0,
    retried: (state.retried ?? 0) + 1,
  });
}

// ——— 几何 ———

const boxHit = (a, ah, b, bh) =>
  Math.abs(a.x - b.x) <= ah.w + bh.w && Math.abs(a.y - b.y) <= ah.h + bh.h;

const halfOf = (enemy) => ({ w: enemy.w / 2, h: enemy.h / 2 });

/**
 * 玩家的受击面积：主机是小方块，机翼往两侧伸出去一截。
 * 「带着机翼更容易被打中」不是文案，是这两个盒子的差。
 */
export function hitBoxes(ship) {
  const boxes = [{ x: ship.x, y: ship.y, w: HULL_HALF_W, h: HULL_HALF_H }];
  if (ship.wing) boxes.push({ x: ship.x, y: ship.y + 0.6, w: WING_HALF_W, h: WING_HALF_H });
  return boxes;
}

const touchesShip = (ship, thing, half) =>
  hitBoxes(ship).some((box) => boxHit(box, box, thing, half));

/**
 * 铁球的位置。绕机自转，靠 orbAngle 推，所以停下来也在转。Mk.III 会多出一枚。
 * 环的半径、转速和球的大小都跟着机翼走（护环贴身快转、远环又大又慢），
 * 取不到就用默认值——老机翼（H / SS）因此一点没变。
 */
export function orbsOf(ship) {
  const wing = ship.wing ? wingAtTier(ship.wing, ship.tier) : null;
  const count = wing?.orbs ?? 0;
  const dist = wing?.orbDist ?? ORB_DIST;
  const spin = wing?.orbSpin ?? 1;
  const radius = wing?.orbR ?? ORB_R;
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ship.orbAngle * spin + (Math.PI * 2 * i) / count;
    list.push({ x: ship.x + Math.cos(angle) * dist, y: ship.y + Math.sin(angle) * dist, r: radius });
  }
  return list;
}

const circleHit = (orb, thing, half) =>
  Math.abs(orb.x - thing.x) <= orb.r + half.w && Math.abs(orb.y - thing.y) <= orb.r + half.h;

// ——— 我方 ———

/** 走位。触屏给的是位移，键盘给的是方向；弃翼后的下潜期还有一截加速。 */
function moveShip(ship, input, dt) {
  const boost = ship.dive > 0 ? DIVE_BOOST : 1;
  const dirX = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  const dirY = (input.held.down ? 1 : 0) - (input.held.up ? 1 : 0);
  const x = ship.x + input.drag.dx * boost + dirX * PLAYER_SPEED * boost * dt;
  const y = ship.y + input.drag.dy * boost + dirY * PLAYER_SPEED * boost * dt;
  return {
    ...ship,
    x: clamp(x, 3, FIELD_W - 3),
    y: clamp(y, PLAYER_MIN_Y, PLAYER_MAX_Y),
    orbAngle: ship.orbAngle + dt * 5.2,
  };
}

/**
 * 开火。带翼时用机翼的 volley（已经按阶级放大过，过载中再乘一层），没翼时只剩主机小炮——
 * 这一行就是「舍弃机翼＝输出窗口消失」的全部实现。
 */
function fireShip(ship, dt, nextId, escortView = null) {
  const wing = ship.wing ? wingAtTier(ship.wing, ship.tier, ship.overdrive > 0) : null;
  const cool = wing ? wing.cool : HULL_GUN.cool;
  let timer = ship.cool - dt;
  let id = nextId;
  const shots = [];
  const emit = (spec, x, flip) => {
    shots.push({
      id,
      x,
      y: ship.y + spec.dy,
      vx: flip ? -spec.vx : spec.vx,
      vy: spec.vy,
      dmg: spec.dmg,
      kind: spec.kind,
      pierce: spec.pierce ?? null,
      ground: Boolean(spec.ground),
      blast: spec.blast ?? 0,
      well: spec.well ?? 0,
      chain: spec.chain ?? 0,
      chainR: spec.chainR ?? 0,
      chainFall: spec.chainFall ?? 0,
      burst: spec.burst ?? 0,
      burstDmg: spec.burstDmg ?? 0,
      echo: Boolean(flip),
      life: spec.life,
      // 阶级跟着子弹走：表现层按它放大弹体——「升阶了，弹都变粗了」看得见。
      tier: wing ? wing.tier : 1,
      // 过载中的子弹另有一层能量鞘，颜色与常态升阶分开。
      surge: Boolean(wing?.surge),
      age: 0,
    });
    id += 1;
  };
  // while 而不是 if：冷却比一帧还短的机翼（加农、火焰、相位激光）一帧要出好几发。
  while (timer <= 0) {
    timer += cool;
    if (wing) {
      for (const spec of wing.volley) {
        emit(spec, ship.x + spec.dx, false);
        // 量子分身：在场地另一侧投一个镜像，同步开同一轮火。
        // 它打的是你顾不到的那半边，所以不算在「打同一个 Boss」的 DPS 里。
        if (wing.echo) emit(spec, FIELD_W - (ship.x + spec.dx), true);
      }
    } else {
      emit({ dx: 0, dy: -3, vx: 0, vy: -HULL_GUN.speed, dmg: HULL_GUN.dmg, kind: 'hull', life: 2.2 }, ship.x, false);
    }
  }
  // 装备槽独立走自己的冷却：机翼换型、升阶、过载都不改它。
  // 弹数恒等于编队数，而且每发都带 chipOnly —— 打 Boss 永远只按弱点 chip 结算，
  // 不会把「选错机翼要磨很久」这条地基稀释掉。
  let gearCool = ship.gearCool ?? 0;
  const gear = ship.gear ? gearSpec(ship.gear) : null;
  if (gear) {
    gearCool -= dt;
    while (gearCool <= 0) {
      gearCool += gear.fire.cool;
      const volley = gearVolley(ship, id, escortView);
      shots.push(...volley.shots);
      id = volley.nextId;
    }
  }
  return { ship: { ...ship, cool: timer, gearCool }, shots, nextId: id };
}

const BURST_SPEED = 76;

/**
 * 反物质弹炸开的那一圈碎片。碎片和普通子弹一样能打掉敌弹——
 * 所以这一发既是伤害，也是一次范围清弹。
 */
function burstOf(shot, startId) {
  const list = [];
  for (let i = 0; i < shot.burst; i += 1) {
    const rad = ((Math.PI * 2) / shot.burst) * i;
    list.push({
      id: startId + i,
      x: shot.x,
      y: shot.y,
      vx: Math.sin(rad) * BURST_SPEED,
      vy: Math.cos(rad) * BURST_SPEED,
      dmg: shot.burstDmg,
      kind: 'shard',
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
      life: 0.55,
      tier: shot.tier ?? 1,
      surge: Boolean(shot.surge),
      age: 0,
    });
  }
  return list;
}

/** 弃翼。翅膀原地脱落并往上飘，主机下潜换来一段无敌——代价是这段时间几乎没有火力。 */
function jettison(state, effects) {
  const ship = state.ship;
  if (!ship.wing || ship.lock > 0) {
    effects.push({ type: 'deny' });
    return state;
  }
  const drop = {
    id: state.nextId,
    kind: 'wing',
    code: ship.wing,
    // 阶级跟着机翼飞出去。攒到 Mk.III 再弃翼，扔掉的是一整套投资。
    tier: ship.tier,
    x: ship.x,
    y: ship.y,
    vy: WING_DRIFT_VY,
    life: WING_DRIFT,
    grace: CATCH_GRACE,
    mine: true,
  };
  effects.push({ type: 'jettison', code: ship.wing, tier: ship.tier });
  return {
    ...state,
    nextId: state.nextId + 1,
    drops: [...state.drops, drop],
    ship: { ...ship, wing: null, tier: 1, overdrive: 0, dive: DIVE_TIME, invuln: Math.max(ship.invuln, DIVE_TIME) },
  };
}

/** 掉命。机翼此时已经不在了（挨打先掉翼），所以走到这里就是裸机被打中。 */
function killShip(state, effects) {
  const lives = state.lives - 1;
  // 掉命：装备掉一级而不是清零，也不还原成进关时的满编队。
  // 重试本章则整槽作废（retryChapter 不带 gear），两档惩罚分开。
  const hadGear = (state.ship.gearLevel ?? 0) > 0;
  const code = state.ship.gear;
  const ship = gearAfterLoss(state.ship);
  effects.push({ type: 'die' });
  if (hadGear) effects.push({ type: 'gearLost', code, level: ship.gearLevel, reason: 'death' });
  if (lives <= 0) {
    return { ...state, ship, lives: 0, status: 'over', stars: 0, chain: 0, effects };
  }
  return {
    ...state,
    ship,
    lives,
    status: 'dying',
    reviveTimer: RESPAWN_DELAY,
    chain: 0,
    effects,
  };
}

/**
 * 推进一帧。返回全新的 state，输入同样一串输入必然得到同样的结果。
 * effects 只描述「这一帧发生了什么」，不描述该怎么表现——那是 scene 层的事。
 */
export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status === 'dying') {
    const timer = state.reviveTimer - dt;
    if (timer > 0) return { ...state, reviveTimer: timer, effects: [] };
    // 复活时清场：让人在一片弹幕正中重开是惩罚，不是难度。
    return {
      ...state,
      status: 'playing',
      reviveTimer: 0,
      foes: [],
      // 复活只还原成这一关带进来的那只翅膀，而且是 Mk.I：攒下来的阶级是真会没的。
      // 装备不同：掉命已经扣掉一级，复活不再还原成进关时那一支满编队——
      // 否则「掉一级」会被复活偷偷补回来，惩罚就成了假的。
      ship: {
        ...makeShip(state.entryWing, 1, {
          code: state.ship.gear,
          level: state.ship.gearLevel,
          guard: state.ship.gearGuard,
        }),
        invuln: HURT_INVULN,
      },
      effects: [{ type: 'revive', code: state.entryWing }],
    };
  }
  if (state.status !== 'playing') return state.effects.length ? { ...state, effects: [] } : state;

  const level = levelAt(state.levelIndex);
  const effects = [];
  let next = {
    ...state,
    time: state.time + dt,
    elapsed: state.elapsed + dt,
    effects,
  };
  const rng = createRandom(state.seed + Math.floor(next.time * 60));

  // ——— 出场 ———
  let enemies = state.enemies;
  let waveIndex = state.waveIndex;
  let nextId = state.nextId;
  // 一关只掉一件装备：挂在本关第一波运载火箭的头一架上。
  // 不在 wave 表里逐关写 gear 字段，装备主题由 levels.js 的 gearDrops 统一给。
  const gearWave = level.waves.findIndex((item) => item.kind === 'carrier');
  while (waveIndex < level.waves.length && next.time >= level.waves[waveIndex].at) {
    const spec = level.waves[waveIndex];
    const gearCode = waveIndex === gearWave ? level.gearDrops?.[0] ?? null : null;
    const spawned = spawnWave(gearCode ? { ...spec, gear: gearCode } : spec, { tune: state.tune, rng, nextId });
    enemies = [...enemies, ...spawned.enemies];
    nextId = spawned.nextId;
    effects.push({ type: 'wave', kind: level.waves[waveIndex].kind });
    waveIndex += 1;
  }

  let boss = state.boss;
  const bossTime = bossAt(level);
  if (!boss && !next.skipped && next.time >= bossTime) {
    boss = makeBoss(level, state.tune);
    effects.push({ type: 'bossIn', weak: boss.weak });
  }

  // 跳关门只在「最后一波之后、Boss 之前」这个窗口里开着。
  // 跳过去省 4 关，可 Boss 一点没削弱——所以这道门本身就是一次风险决策。
  let gate = state.gate;
  const gateOpen = Math.max(...level.waves.map((item) => item.at)) + GATE_LEAD;
  if (level.skip && !gate && !boss && state.time < gateOpen && next.time >= gateOpen) {
    gate = { x: FIELD_W / 2, y: -10, w: 24, h: 9 };
    effects.push({ type: 'gateIn' });
  }
  if (gate) {
    gate = { ...gate, y: gate.y + GATE_SPEED * dt };
    if (gate.y > FIELD_H + 12) {
      gate = null;
      effects.push({ type: 'gateGone' });
    }
  }

  // ——— 我方推进 ———
  let ship = {
    ...state.ship,
    invuln: Math.max(0, state.ship.invuln - dt),
    dive: Math.max(0, state.ship.dive - dt),
    lock: Math.max(0, state.ship.lock - dt),
    overdrive: Math.max(0, (state.ship.overdrive ?? 0) - dt),
  };
  // 无敌结束的那一帧如果还没接到新翼，就是这游戏最危险的瞬间——它值得一声警告。
  if (state.ship.dive > 0 && ship.dive === 0 && !ship.wing) effects.push({ type: 'bare' });

  next = { ...next, ship, enemies, waveIndex, nextId, boss, gate };
  if (input.jettison) {
    next = jettison(next, effects);
    ship = next.ship;
    nextId = next.nextId;
  }

  ship = moveShip(ship, input, dt);
  // 僚机索敌：开火与近身消弹必须读同一份战况，否则弹从一个位置出、护圈却在另一个位置。
  // 这是纯函数（时间 + 目标表），不往 state 里存「僚机在哪」，复活/跨关/重试都不用搬运。
  const escortView = escortWorld({ ...next, ship, enemies, boss });
  const fired = fireShip(ship, dt, nextId, escortView);
  ship = fired.ship;
  nextId = fired.nextId;

  // 巡航导弹只在带 homing 标记的装备弹上转向，目标表与僚机索敌共用一份（各追各的）。
  // 转向会改 vx，但 chipOnly 让 Boss 命中在 bossShotMultiplier 里直接短路到 chip，
  // 不会因为「碰巧侧着飞」就打进侧面弱点。
  const homingTargets = escortView.targets;
  let shots = [...state.shots, ...fired.shots].map((item) => {
    const v = item.homing && homingTargets.length
      ? steerHoming(item, homingTargets[(item.escort ?? 0) % homingTargets.length], dt)
      : { vx: item.vx, vy: item.vy };
    return {
      ...item,
      vx: v.vx,
      vy: v.vy,
      x: item.x + v.vx * dt,
      y: item.y + v.vy * dt,
      age: item.age + dt,
    };
  });
  // 反物质弹耗尽的那一刻要炸开，所以过滤时得把它拦下来，不能一删了之。
  const spent = [];
  shots = shots.filter((item) => {
    const alive = item.age < item.life && !offField(item, 10);
    if (!alive && item.burst > 0 && !offField(item, 10)) spent.push(item);
    return alive;
  });
  for (const shot of spent) {
    const ring = burstOf(shot, nextId);
    nextId += ring.length;
    shots.push(...ring);
    effects.push({ type: 'burst', x: shot.x, y: shot.y });
  }

  // ——— 敌方推进 ———
  const enemyList = [];
  let foes = state.foes.map((item) => stepShot(item, dt));
  for (const enemy of enemies) {
    const moved = stepEnemy(enemy, dt, { ship, tune: state.tune, nextId });
    nextId = moved.nextId;
    enemyList.push(moved.enemy);
    if (moved.shots.length) foes = [...foes, ...moved.shots];
  }

  if (boss) {
    const moved = stepBoss(boss, dt, { ship, nextId });
    boss = moved.boss;
    nextId = moved.nextId;
    if (moved.shots.length) foes = [...foes, ...moved.shots];
  }
  foes = foes.filter((item) => !offField(item, 14));

  // ——— 命中判定 ———
  let score = state.score;
  let chain = state.chain;
  let bestChain = state.bestChain;
  let pops = state.pops;
  let kills = state.kills;
  let lives = state.lives;
  let wingLosses = state.wingLosses ?? 0;
  let hits = state.hits ?? 0;
  // 这一帧新脱手的机翼已经在 next.drops 里了，从它接着算，别从上一帧的旧列表算。
  let drops = next.drops;

  const pop = (index) => {
    const foe = foes[index];
    foes[index] = null;
    chain += 1;
    bestChain = Math.max(bestChain, chain);
    pops += 1;
    score += popScore(chain);
    effects.push({ type: 'pop', chain, x: foe.x, y: foe.y });
  };

  // 引力井：把射程内的敌弹往井心拽，拽到井心就湮灭。
  // 它不是「把弹幕躲掉」，是「把弹幕吃掉」——实验机翼那条路的核心就在这几行。
  for (const shot of shots) {
    if (!shot.well) continue;
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (!foe) continue;
      const dx = shot.x - foe.x;
      const dy = shot.y - foe.y;
      const dist = Math.hypot(dx, dy);
      if (dist > shot.well) continue;
      if (dist <= WELL_KILL) {
        pop(i);
        continue;
      }
      const pull = (WELL_PULL * dt) / dist;
      foes[i] = { ...foe, x: foe.x + dx * pull, y: foe.y + dy * pull };
    }
  }

  // 打掉敌弹。这是这游戏的身份：弹幕是可以被火力抵消的。
  for (const shot of shots) {
    if (shot.dead) continue;
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (!foe) continue;
      if (Math.abs(shot.x - foe.x) > 2.6 || Math.abs(shot.y - foe.y) > 2.6) continue;
      pop(i);
      // 引力井自己不该被一发子弹消掉：它是要一路犁过去的。
      if (!shot.pierce && !shot.well) {
        shot.dead = true;
        break;
      }
    }
  }

  // 打敌人。armor 为空的敌人按「没有装甲」算，贴地目标只吃炸弹——和 Boss 用的是同一套倍率。
  const bursts = [];
  for (const shot of shots) {
    if (shot.dead) continue;
    for (const enemy of enemyList) {
      if (enemy.hp <= 0) continue;
      if (!boxHit(shot, { w: 1.2, h: 1.6 }, enemy, halfOf(enemy))) continue;
      // 穿透弹对同一个目标只算一次伤害，否则它待在目标体内的每一帧都在结算。
      if (shot.hit?.includes(enemy.id)) continue;
      const mult = damageMultiplier(enemy.armor ?? 'swarm', shot);
      enemy.hp -= shot.dmg * mult;
      effects.push({ type: mult < 1 ? 'chip' : 'hit' });
      // 链弧炮：命中之后电弧跳到旁边的敌人身上。编队越密，一发打掉的越多。
      if (shot.chain > 0) {
        const near = enemyList
          .filter((other) => other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= shot.chainR)
          .slice(0, shot.chain);
        let from = enemy;
        for (const other of near) {
          other.hp -= shot.dmg * shot.chainFall * damageMultiplier(other.armor ?? 'swarm', shot);
          effects.push({ type: 'arc', x1: from.x, y1: from.y, x2: other.x, y2: other.y });
          from = other;
        }
      }
      if (shot.burst > 0) bursts.push(shot);
      // 穿甲弹连障碍物一起穿，火焰只穿敌人，其余打中就没。
      if (shot.pierce === 'armor' || (shot.pierce === 'targets' && !enemy.blocks)) {
        shot.hit = [...(shot.hit ?? []), enemy.id];
        continue;
      }
      shot.dead = true;
      break;
    }
  }

  // 打 Boss。选对机翼是 pierce，选错是 chip——这两声必须分得开，否则「武器即钥匙」只写在文档里。
  // 过载中的 Boss 不再吃伤害：它已经在谢幕了，别让余弹抢走爆炸的戏。
  if (boss && !boss.entering && !boss.dying) {
    for (const shot of shots) {
      if (shot.dead || shot.hit?.includes('boss')) continue;
      if (!boxHit(shot, { w: 1.2, h: 1.6 }, boss, { w: boss.w / 2, h: boss.h / 2 })) continue;
      // 僚机弹一律只按 chip 结算：装备给的是「活下来」和「看得爽」，
      // 不是 Boss 战的火力答案。effectiveDps / bossHp 因此一行都不用改。
      // 生物系 Boss 本来没有装甲（chip = 1），所以这一条对它是「正常伤害」，不是赦免。
      const mult = bossShotMultiplier(boss.weak, shot);
      boss = { ...boss, hp: boss.hp - shot.dmg * mult };
      effects.push({ type: shot.chipOnly ? 'chip' : hitKind(boss.weak, shot) });
      if (shot.burst > 0) bursts.push(shot);
      if (shot.pierce === 'armor') shot.hit = [...(shot.hit ?? []), 'boss'];
      else shot.dead = true;
    }
  }

  // 命中炸开的那一圈：和耗尽炸开是同一份碎片，只是触发早了。
  for (const shot of bursts) {
    const ring = burstOf(shot, nextId);
    nextId += ring.length;
    shots.push(...ring);
    effects.push({ type: 'burst', x: shot.x, y: shot.y });
  }

  // 僚机的近身消弹圈：照铁球那套范式，蹭掉的敌弹走 pop()，
  // 所以照样算连消、照样给分、照样出声。只对敌弹生效，
  // 不碰杂兵也不碰 Boss —— 装备不进火力配平，只把「活下来」这件事做厚。
  for (const escort of escortsOf(ship, escortView)) {
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (foe && Math.abs(escort.x - foe.x) <= escort.r + 1.4 && Math.abs(escort.y - foe.y) <= escort.r + 1.4) pop(i);
    }
  }

  // 铁球：贴身的东西自己会没。球撞到敌弹就把它蹭掉（走 pop，所以照样算连消、照样给分），
  // 这就是环形护翼那一路的全部依据——不是把弹幕躲掉，是把弹幕蹭掉。
  const orbs = orbsOf(ship);
  for (const orb of orbs) {
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (foe && Math.abs(orb.x - foe.x) <= orb.r + 1.4 && Math.abs(orb.y - foe.y) <= orb.r + 1.4) pop(i);
    }
    for (const enemy of enemyList) {
      if (enemy.hp > 0 && circleHit(orb, enemy, halfOf(enemy))) enemy.hp -= ORB_DPS * dt;
    }
    if (boss && !boss.entering && !boss.dying && circleHit(orb, boss, { w: boss.w / 2, h: boss.h / 2 })) {
      const probe = { vx: 0, vy: -1, pierce: null, ground: false };
      boss = { ...boss, hp: boss.hp - ORB_DPS * dt * damageMultiplier(boss.weak, probe) };
    }
  }

  shots = shots.filter((item) => !item.dead);
  foes = foes.filter(Boolean);

  // 血量归零不是当场结算，是进入死亡演出：1.3 秒的过载，爆炸节奏由结算段安排。
  // 这一瞬间它打出来的弹幕全部化为火花——通关的礼节，不是给玩家刷分的清屏。
  // 挪在 foes 过滤之后：消掉的弹在 pop 里只是置 null，这里拿到的才是干净的列表。
  if (boss && !boss.entering && !boss.dying && boss.hp <= 0) {
    boss = { ...boss, dying: true, deathTimer: BOSS_DEATH_TIME, blastTimer: 0.02 };
    effects.push({ type: 'bossDying', x: boss.x, y: boss.y });
    if (foes.length) {
      effects.push({ type: 'hush', points: foes.slice(0, 48).map((foe) => [foe.x, foe.y]) });
      foes = [];
    }
  }

  // ——— 敌人阵亡与掉落 ———
  const alive = [];
  for (const enemy of enemyList) {
    if (enemy.hp > 0) {
      if (!offField(enemy, 20)) alive.push(enemy);
      else if (enemy.kind === 'carrier') effects.push({ type: 'escaped', code: enemy.wing });
      continue;
    }
    score += enemy.score;
    kills += 1;
    effects.push({ type: 'kill', kind: enemy.kind, x: enemy.x, y: enemy.y });
    if (enemy.kind === 'carrier' && enemy.wing) {
      // 运载火箭是关卡中途唯一的换翼机会，所以它掉的是菱形机翼道具。
      drops = [
        ...drops,
        { id: nextId, kind: 'wing', code: enemy.wing, x: enemy.x, y: enemy.y, vy: 13, life: 9, mine: false },
      ];
      nextId += 1;
      effects.push({ type: 'carrier', code: enemy.wing, x: enemy.x, y: enemy.y });
    }
    if (enemy.gear && gearSpec(enemy.gear)) {
      // 装备从同一枚运载火箭里掉出来，但形状是六边形：捡之前就得能分清是什么。
      drops = [
        ...drops,
        {
          id: nextId,
          kind: 'gear',
          code: enemy.gear,
          x: enemy.x + 6,
          y: enemy.y + 2,
          vy: GEAR_DROP_VY,
          life: GEAR_DROP_LIFE,
          grace: 0,
          mine: false,
        },
      ];
      nextId += 1;
      effects.push({ type: 'gearCarrier', code: enemy.gear, x: enemy.x + 6, y: enemy.y + 2 });
    }
  }

  // ——— 机翼道具 ———
  // 同频共振：两副同构翼面合榫的瞬间会向外放一圈相位冲击，把半径内的敌弹震碎。
  // 走 pop() 而不是直接删，所以消弹照样算连消、照样给分、照样出声。
  // pop 只把槽位置成 null，这一段的最后统一过滤，别把 null 留给下面的挨打判定。
  const syncBurst = (x, y) => {
    let cleared = 0;
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (!foe || Math.hypot(foe.x - x, foe.y - y) > SYNC_BURST_R) continue;
      pop(i);
      cleared += 1;
    }
    return cleared;
  };
  const keptDrops = [];
  // 同一帧机翼和装备都在拾取圈里：先处理机翼，再处理装备。
  // 两个槽互不相干，所以两件都会捡；排序只是让「换装」发生在编队合流之前，
  // 免得同一帧里 ship 被两条分支各写一遍，效果飘字也跟着乱序。
  // 老 drop 没有 kind 字段，一律按机翼兼容（存档、测试构造的旧状态都走旧路径）。
  const ordered = [...drops].sort((a, b) => (a.kind === 'gear' ? 1 : 0) - (b.kind === 'gear' ? 1 : 0));
  for (const drop of ordered) {
    const kind = drop.kind ?? 'wing';
    const moved = { ...drop, kind, y: drop.y + drop.vy * dt, life: drop.life - dt, grace: Math.max(0, (drop.grace ?? 0) - dt) };
    if (moved.life <= 0 || offField(moved, 14)) {
      if (moved.mine) effects.push({ type: kind === 'gear' ? 'gearGone' : 'lost', code: moved.code });
      continue;
    }
    // grace 是刚脱手那一小段：这段时间接不回来，弃翼才是一次真的取舍。
    if (moved.grace <= 0 && Math.hypot(moved.x - ship.x, moved.y - ship.y) <= CATCH_R) {
      if (kind === 'gear') {
        // 装备不共用同频共振：捡同型号只是编队 1→2→3 的合流，不放相位冲击。
        const picked = gearPick(ship, moved.code);
        if (picked.kind === 'invalid') { keptDrops.push(moved); continue; }
        if (picked.kind === 'swap' && picked.old) {
          keptDrops.push({
            id: nextId,
            kind: 'gear',
            code: picked.old.code,
            level: picked.old.level,
            x: ship.x,
            y: ship.y,
            vy: GEAR_DRIFT_VY,
            life: GEAR_DRIFT,
            grace: CATCH_GRACE,
            mine: true,
          });
          nextId += 1;
        }
        ship = { ...ship, ...picked.fields };
        score += picked.kind === 'full' ? GEAR_FULL_SCORE : picked.kind === 'sync' ? GEAR_SYNC_SCORE : GEAR_CATCH_SCORE;
        effects.push({
          type: { new: 'gearCatch', sync: 'gearSync', full: 'gearFull', swap: 'gearSwap' }[picked.kind],
          code: moved.code,
          level: picked.fields.gearLevel,
          x: ship.x,
          y: ship.y,
        });
        continue;
      }
      const tier = clampTier(moved.tier ?? 1);
      if (!ship.wing) {
        // 空手接翼：捡到什么阶级就是什么阶级。过载是临时的，接翼不继承。
        ship = { ...ship, wing: moved.code, tier, overdrive: 0, lock: JETTISON_LOCK };
        effects.push({ type: 'catch', code: moved.code, tier });
      } else if (ship.wing === moved.code) {
        // 同型号叠加＝同频共振。阶级往上抬，同时放一圈冲击把身边的弹幕震碎。
        if (ship.tier < MAX_TIER) {
          const next = clampTier(ship.tier + 1);
          score += EVOLVE_SCORE;
          const cleared = syncBurst(ship.x, ship.y);
          ship = {
            ...ship,
            tier: next,
            lock: JETTISON_LOCK,
            invuln: Math.max(ship.invuln, SYNC_BURST_INVULN),
          };
          effects.push({ type: 'evolve', code: moved.code, tier: next, x: ship.x, y: ship.y, cleared, radius: SYNC_BURST_R });
        } else {
          // 已经满阶：阶级封顶，换成一段限时相位过载——重复机翼永远不白捡。
          score += OVERDRIVE_SCORE;
          const cleared = syncBurst(ship.x, ship.y);
          ship = {
            ...ship,
            overdrive: OVERDRIVE_TIME,
            lock: JETTISON_LOCK,
            invuln: Math.max(ship.invuln, SYNC_BURST_INVULN),
          };
          effects.push({ type: 'topped', code: moved.code, tier: MAX_TIER });
          effects.push({ type: 'overdrive', code: moved.code, x: ship.x, y: ship.y, cleared, radius: SYNC_BURST_R, time: OVERDRIVE_TIME });
        }
      } else {
        // 换装：旧的原地脱手（带着它攒的阶级），你还能反悔一次。相位编码不兼容，过载清零。
        keptDrops.push({ id: nextId, code: ship.wing, tier: ship.tier, x: ship.x, y: ship.y, vy: WING_DRIFT_VY, life: WING_DRIFT, grace: CATCH_GRACE, mine: true });
        nextId += 1;
        ship = { ...ship, wing: moved.code, tier, overdrive: 0, lock: JETTISON_LOCK };
        effects.push({ type: 'swap', code: moved.code, tier });
      }
      continue;
    }
    keptDrops.push(moved);
  }
  drops = keptDrops;
  // pop 留下的空槽在这里收干净：下面的挨打判定会直接读 foes 里的对象。
  foes = foes.filter(Boolean);

  // ——— 挨打 ———
  // 机翼同时是装甲：带翼被打中只掉翼，裸机被打中才掉命。
  // 于是「保留机翼」多出来的受击面积换来一次容错，这笔账每一秒都在算。
  //
  // 被打掉的翼不是消失，是被崩开成一枚还能捡回来的道具——你有一次抢回来的机会。
  const takeHit = (source) => {
    if (ship.invuln > 0) return false;
    // 连消清零，但历史最好成绩留着：这一局压过的最长一串是战绩，不该被一次挨打抹掉。
    bestChain = Math.max(bestChain, chain);
    chain = 0;
    // 战报记两笔：挨了几下、其中几下是掉翼。掉翼不清零连消以外的东西，
    // 但「这一局被削掉几次翼」正是玩家复盘时最想知道的那个数。
    hits += 1;
    if (ship.wing) {
      wingLosses += 1;
      drops = [
        ...drops,
        { id: nextId, kind: 'wing', code: ship.wing, tier: ship.tier, x: ship.x, y: ship.y, vy: WING_DRIFT_VY * 0.6, life: WING_DRIFT, grace: CATCH_GRACE, mine: true },
      ];
      nextId += 1;
      effects.push({ type: 'wingLost', code: ship.wing, tier: ship.tier, from: source, x: ship.x, y: ship.y });
      ship = { ...ship, wing: null, tier: 1, overdrive: 0, invuln: HURT_INVULN };
      return false;
    }
    // 裸机＋还有编队＋这一关的替挡机会没用过：消耗一架僚机，把这条命买回来。
    // 带翼被打中仍然只掉翼——机翼本身就是装甲，僚机是最后一道防线，不是常驻免费护盾。
    // 替挡机会用完（gearGuard = false）之后，再挨一下就是真的掉命，装备掉一级。
    if (ship.gearGuard && (ship.gearLevel ?? 0) > 0) {
      const code = ship.gear;
      ship = { ...gearAfterBlock(ship), invuln: GEAR_BLOCK_INVULN };
      effects.push({ type: 'gearBlock', code, left: ship.gearLevel, from: source, x: ship.x, y: ship.y });
      if (!ship.gear) effects.push({ type: 'gearLost', code, level: 0, reason: 'block' });
      return false;
    }
    return true;
  };

  let fatal = false;
  foes = foes.filter((foe) => {
    if (fatal || ship.invuln > 0) return true;
    if (!touchesShip(ship, foe, { w: 1.4, h: 1.6 })) return true;
    fatal = takeHit('foe');
    return false;
  });

  for (const enemy of alive) {
    if (fatal || ship.invuln > 0) break;
    if (!touchesShip(ship, enemy, halfOf(enemy))) continue;
    fatal = takeHit('enemy');
    if (!enemy.blocks) enemy.hp = 0;
  }
  if (!fatal && boss && !boss.entering && !boss.dying && ship.invuln <= 0 && touchesShip(ship, boss, { w: boss.w / 2, h: boss.h / 2 })) {
    fatal = takeHit('boss');
  }

  // ——— 结算 ———
  const finalEnemies = alive.filter((enemy) => enemy.hp > 0);
  let status = 'playing';
  let skipped = state.skipped;

  // 撞进跳关门就跳 4 关。省下的四关不给分，只给一笔跳关奖励——跳过去的东西没被打掉。
  if (gate && touchesShip(ship, gate, { w: gate.w / 2, h: gate.h / 2 })) {
    score += SKIP_SCORE;
    skipped = true;
    status = 'clear';
    gate = null;
    effects.push({ type: 'skip' });
  } else if (boss && boss.dying) {
    // 死亡演出：按固定节奏在壳体上炸开（抖动走 rng，回放可复现），
    // 计时到了才真正结算——BOSS_SCORE、过关和弦都在最后一拍。
    const timer = boss.deathTimer - dt;
    let blastTimer = boss.blastTimer - dt;
    if (blastTimer <= 0) {
      blastTimer = BOSS_BLAST_EVERY;
      effects.push({
        type: 'bossBlast',
        x: boss.x + (rng.next() - 0.5) * boss.w * 0.72,
        y: boss.y + (rng.next() - 0.5) * boss.h * 0.72,
      });
    }
    if (timer <= 0) {
      score += BOSS_SCORE;
      status = 'clear';
      effects.push({ type: 'bossKill', x: boss.x, y: boss.y });
      effects.push({ type: 'clear' });
      boss = null;
    } else {
      boss = { ...boss, deathTimer: timer, blastTimer };
    }
  }

  const settled = {
    ...state,
    status,
    time: next.time,
    elapsed: next.elapsed,
    waveIndex,
    ship,
    drops,
    shots,
    foes,
    enemies: finalEnemies,
    boss,
    gate,
    skipped,
    score,
    chain,
    bestChain,
    pops,
    kills,
    lives,
    wingLosses,
    hits,
    nextId,
    effects,
  };

  if (fatal) return killShip(settled, effects);
  if (status === 'clear') return { ...settled, stars: resultStars({ ...settled, status: 'clear' }) };
  return settled;
}
