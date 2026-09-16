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
  DIVE_BOOST,
  DIVE_TIME,
  EVOLVE_SCORE,
  FIELD_H,
  FIELD_W,
  HULL_GUN,
  HULL_HALF_H,
  HULL_HALF_W,
  HURT_INVULN,
  JETTISON_LOCK,
  LIFE_BONUS,
  PLAYER_MAX_Y,
  PLAYER_MIN_Y,
  PLAYER_SPEED,
  PLAYER_Y,
  RESPAWN_DELAY,
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
import { LEVELS, bossAt, canSelect, levelAt, skipTarget } from './levels.js';
import { MAX_TIER, WINGS, clampTier, damageMultiplier, hitKind, wingAtTier } from './wings.js';
import { offField, spawnWave, stepEnemy, stepShot } from './enemies.js';
import { makeBoss, stepBoss } from './boss.js';
import { createRandom } from './random.js';

export { EMPTY_INPUT };
export const STEP = 1 / 60;

// 跳关门的出现窗口：最后一波清完 3 秒后开门，Boss 出场前关门。
const GATE_LEAD = 3;
const GATE_SPEED = 22;
const ORB_R = 2.6;
const ORB_DPS = 7;
const ORB_DIST = 9.5;

const makeShip = (wing, tier = 1) => ({
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
    ship: makeShip(carry.wing ?? null, carry.tier ?? 1),
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
    chain: 0,
    bestChain: carry.bestChain ?? 0,
    pops: carry.pops ?? 0,
    kills: carry.kills ?? 0,
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
export const startGame = (levelIndex = 0, wing = null) => {
  const state = loadLevel(levelIndex, { wing });
  return wing ? { ...state, status: 'playing' } : state;
};

export const togglePause = (state) => {
  if (state.status === 'playing') return { ...state, status: 'paused', effects: [] };
  if (state.status === 'paused') return { ...state, status: 'playing', effects: [] };
  return state;
};

/** 选翼界面按下某一种机翼。只有 select 状态接受这个动作。 */
export function chooseWing(state, code) {
  if (state.status !== 'select' || !WINGS[code]) return state;
  return {
    ...state,
    status: 'playing',
    ship: { ...state.ship, wing: code, tier: 1 },
    entryWing: code,
    effects: [{ type: 'catch', code }],
  };
}

/** 打完一关往下走。skipped 决定是 +1 还是跳 4 关。 */
export function advance(state) {
  if (state.status !== 'clear') return state;
  const next = state.skipped ? skipTarget(state.levelIndex) : state.levelIndex + 1;
  const carry = {
    wing: state.ship.wing,
    tier: state.ship.tier,
    lives: state.lives,
    score: state.score,
    bestChain: state.bestChain,
    pops: state.pops,
    kills: state.kills,
    elapsed: state.elapsed,
  };
  if (next >= LEVELS.length) {
    // 通关结算：剩下的命折成分。留着命通关比擦着边通关更值钱。
    const finished = { ...state, status: 'won', score: state.score + state.lives * LIFE_BONUS };
    return { ...finished, stars: resultStars(finished), effects: [] };
  }
  return loadLevel(next, carry);
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

/** 铁球的位置。绕机自转，靠 orbAngle 推，所以停下来也在转。Mk.III 会多出一枚。 */
export function orbsOf(ship) {
  const wing = ship.wing ? wingAtTier(ship.wing, ship.tier) : null;
  const count = wing?.orbs ?? 0;
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ship.orbAngle + (Math.PI * 2 * i) / count;
    list.push({ x: ship.x + Math.cos(angle) * ORB_DIST, y: ship.y + Math.sin(angle) * ORB_DIST, r: ORB_R });
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
 * 开火。带翼时用机翼的 volley（已经按阶级放大过），没翼时只剩主机小炮——
 * 这一行就是「舍弃机翼＝输出窗口消失」的全部实现。
 */
function fireShip(ship, dt, nextId) {
  const wing = ship.wing ? wingAtTier(ship.wing, ship.tier) : null;
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
  return { ship: { ...ship, cool: timer }, shots, nextId: id };
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
    ship: { ...ship, wing: null, tier: 1, dive: DIVE_TIME, invuln: Math.max(ship.invuln, DIVE_TIME) },
  };
}

/** 掉命。机翼此时已经不在了（挨打先掉翼），所以走到这里就是裸机被打中。 */
function killShip(state, effects) {
  const lives = state.lives - 1;
  effects.push({ type: 'die' });
  if (lives <= 0) {
    return { ...state, lives: 0, status: 'over', stars: 0, chain: 0, effects };
  }
  return {
    ...state,
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
      ship: { ...makeShip(state.entryWing, 1), invuln: HURT_INVULN },
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
  while (waveIndex < level.waves.length && next.time >= level.waves[waveIndex].at) {
    const spawned = spawnWave(level.waves[waveIndex], { tune: state.tune, rng, nextId });
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
  const fired = fireShip(ship, dt, nextId);
  ship = fired.ship;
  nextId = fired.nextId;

  let shots = [...state.shots, ...fired.shots].map((item) => ({
    ...item,
    x: item.x + item.vx * dt,
    y: item.y + item.vy * dt,
    age: item.age + dt,
  }));
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
  if (boss && !boss.entering) {
    for (const shot of shots) {
      if (shot.dead || shot.hit?.includes('boss')) continue;
      if (!boxHit(shot, { w: 1.2, h: 1.6 }, boss, { w: boss.w / 2, h: boss.h / 2 })) continue;
      const mult = damageMultiplier(boss.weak, shot);
      boss = { ...boss, hp: boss.hp - shot.dmg * mult };
      effects.push({ type: hitKind(boss.weak, shot) });
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

  // 铁球：贴身的东西自己会没。这也是 H 机翼人气最高的原因。
  const orbs = orbsOf(ship);
  for (const orb of orbs) {
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (foe && Math.abs(orb.x - foe.x) <= orb.r + 1.4 && Math.abs(orb.y - foe.y) <= orb.r + 1.4) pop(i);
    }
    for (const enemy of enemyList) {
      if (enemy.hp > 0 && circleHit(orb, enemy, halfOf(enemy))) enemy.hp -= ORB_DPS * dt;
    }
    if (boss && !boss.entering && circleHit(orb, boss, { w: boss.w / 2, h: boss.h / 2 })) {
      const probe = { vx: 0, vy: -1, pierce: null, ground: false };
      boss = { ...boss, hp: boss.hp - ORB_DPS * dt * damageMultiplier(boss.weak, probe) };
    }
  }

  shots = shots.filter((item) => !item.dead);
  foes = foes.filter(Boolean);

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
        { id: nextId, code: enemy.wing, x: enemy.x, y: enemy.y, vy: 13, life: 9, mine: false },
      ];
      nextId += 1;
      effects.push({ type: 'carrier', code: enemy.wing, x: enemy.x, y: enemy.y });
    }
  }

  // ——— 机翼道具 ———
  const keptDrops = [];
  for (const drop of drops) {
    const moved = { ...drop, y: drop.y + drop.vy * dt, life: drop.life - dt, grace: Math.max(0, (drop.grace ?? 0) - dt) };
    if (moved.life <= 0 || offField(moved, 14)) {
      if (moved.mine) effects.push({ type: 'lost', code: moved.code });
      continue;
    }
    // grace 是刚脱手那一小段：这段时间接不回来，弃翼才是一次真的取舍。
    if (moved.grace <= 0 && Math.hypot(moved.x - ship.x, moved.y - ship.y) <= CATCH_R) {
      const tier = clampTier(moved.tier ?? 1);
      if (!ship.wing) {
        // 空手接翼：捡到什么阶级就是什么阶级。
        ship = { ...ship, wing: moved.code, tier, lock: JETTISON_LOCK };
        effects.push({ type: 'catch', code: moved.code, tier });
      } else if (ship.wing === moved.code) {
        // 同型号叠加＝进化。这是运载火箭掉重复机翼时最想看到的一幕。
        if (ship.tier < MAX_TIER) {
          const next = clampTier(ship.tier + 1);
          score += EVOLVE_SCORE;
          ship = { ...ship, tier: next, lock: JETTISON_LOCK };
          effects.push({ type: 'evolve', code: moved.code, tier: next, x: moved.x, y: moved.y });
        } else {
          // 已经满阶：不浪费成一次静默的空捡，补一发满血提示。
          effects.push({ type: 'topped', code: moved.code, tier: MAX_TIER });
        }
      } else {
        // 换装：旧的原地脱手（带着它攒的阶级），你还能反悔一次。
        keptDrops.push({ id: nextId, code: ship.wing, tier: ship.tier, x: ship.x, y: ship.y, vy: WING_DRIFT_VY, life: WING_DRIFT, grace: CATCH_GRACE, mine: true });
        nextId += 1;
        ship = { ...ship, wing: moved.code, tier, lock: JETTISON_LOCK };
        effects.push({ type: 'swap', code: moved.code, tier });
      }
      continue;
    }
    keptDrops.push(moved);
  }
  drops = keptDrops;

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
    if (ship.wing) {
      drops = [
        ...drops,
        { id: nextId, code: ship.wing, tier: ship.tier, x: ship.x, y: ship.y, vy: WING_DRIFT_VY * 0.6, life: WING_DRIFT, grace: CATCH_GRACE, mine: true },
      ];
      nextId += 1;
      effects.push({ type: 'wingLost', code: ship.wing, tier: ship.tier, from: source, x: ship.x, y: ship.y });
      ship = { ...ship, wing: null, tier: 1, invuln: HURT_INVULN };
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
  if (!fatal && boss && !boss.entering && ship.invuln <= 0 && touchesShip(ship, boss, { w: boss.w / 2, h: boss.h / 2 })) {
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
  } else if (boss && boss.hp <= 0) {
    score += BOSS_SCORE;
    status = 'clear';
    boss = null;
    effects.push({ type: 'bossKill' });
    effects.push({ type: 'clear' });
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
    nextId,
    effects,
  };

  if (fatal) return killShip(settled, effects);
  if (status === 'clear') return { ...settled, stars: resultStars({ ...settled, status: 'clear' }) };
  return settled;
}
