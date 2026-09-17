// 一辆车的判定。人和机器人走的是同一个函数：判定层分不出方向盘后面是谁，
// 所以「让满档大脑接管玩家跑完八关」这种测试才成立。
//
// 车有两个方向，这是整套手感的根：**车头 heading** 和 **速度方向 course**。
// 抓地时后者几乎瞬间追上前者，漂移时故意追得慢，追不上的那点夹角就是漂移角。
// 于是漂移不是一个布尔状态加一段特效，而是「车头已经指向出弯，车身还在往弯外滑」这件事本身——
// 攒气的速率也就顺理成章地跟着夹角和车速走。

import {
  ACCEL,
  BODY,
  BOOST_ACCEL,
  BOOST_SPEED,
  BOOST_TIME,
  BUMP_CLOSING,
  BUMP_COOL,
  BUMP_KEEP,
  CARRY,
  CHARGE_MAX,
  CHARGE_RATE,
  COMBO_WINDOW,
  COURSE_DRIFT,
  COURSE_GRIP,
  DRAFT_GAIN,
  DRIFT_MAX,
  DRIFT_MIN,
  DRIFT_SCRUB,
  DRIFT_TURN,
  GRASS_SPEED,
  GRIP_TURN,
  MAX_SPEED,
  OVER_DRAG,
  SHOULDER,
  STALL_SPEED,
  TOKEN_MAX,
  WALL_COOL,
  WALL_KEEP,
  WALL_MIN,
  WALL_TURN_IN,
  clamp,
  tierOf,
  turnScale,
  wrapAngle,
} from './rules.js';

export const EMPTY_INPUT = { steer: 0, drift: false, boost: false };

export function createKart({ id, name, color, bot = true, skill = 1 }) {
  return {
    id,
    name,
    color,
    bot,
    skill,
    x: 0,
    y: 0,
    heading: 0,
    course: 0,
    speed: 0,
    drifting: false,
    driftAngle: 0,
    charge: 0,
    chain: 0,
    comboTimer: 0,
    tokens: [],
    boostTime: 0,
    boostTier: 0,
    stall: 0,
    launch: null,
    bumpCool: 0,
    wallCool: 0,
    node: 0,
    s: 0,
    lateral: 0,
    offTrack: false,
    draft: false,
    draftTime: 0,
    progress: 0,
    lap: 0,
    lapStart: 0,
    lapTimes: [],
    best: 0,
    finished: false,
    finishTime: 0,
    rank: 1,
    driftTime: 0,
    boosts: 0,
    wallHits: 0,
    grassTime: 0,
  };
}

/**
 * 发车。两车一排，前后错开 8 米，左右各让出 45% 半宽——
 * 起跑线上的 progress 是负数（还没过线），所以第一圈和后面几圈用的是同一套计圈逻辑。
 */
export function placeKart(kart, course, row, lane) {
  const back = -row * 8;
  const s = course.wrapS(back);
  const point = course.pointAt(s);
  const offset = lane * course.half * 0.45;
  kart.x = point.x - Math.sin(point.heading) * offset;
  kart.y = point.y + Math.cos(point.heading) * offset;
  kart.heading = point.heading;
  kart.course = point.heading;
  kart.speed = 0;
  const hit = course.project(kart.x, kart.y);
  kart.node = hit.index;
  kart.s = hit.s;
  kart.lateral = hit.lateral;
  kart.progress = back;
  // 起跑线后面的车 progress 是负的，圈数跟着一起是 -1：
  // 这样「第一次过线」和「跑完一圈」用的是同一个判断，不用为第一圈开特例。
  kart.lap = Math.floor(back / course.length);
  return kart;
}

/** 手上最大的一档喷。攒了三档小喷不如攒一档大喷，所以取最大而不是先进先出。 */
const takeToken = (tokens) => {
  let bestAt = 0;
  for (let i = 1; i < tokens.length; i += 1) if (tokens[i] > tokens[bestAt]) bestAt = i;
  return tokens.splice(bestAt, 1)[0];
};

export function stepKart(kart, input, dt, course, effects, now = 0) {
  const emit = (type, extra) => effects.push({ type, kart: kart.id, self: kart.id === 0, ...extra });

  kart.boostTime = Math.max(0, kart.boostTime - dt);
  if (kart.boostTime === 0) kart.boostTier = 0;
  kart.stall = Math.max(0, kart.stall - dt);
  kart.wallCool = Math.max(0, kart.wallCool - dt);
  if (kart.comboTimer > 0) {
    kart.comboTimer -= dt;
    // 窗口过期的那一帧就把连喷数清掉：连喷断了就是断了，不留半截账。
    if (kart.comboTimer <= 0) kart.chain = 0;
  }

  const steer = clamp(input.steer ?? 0, -1, 1);
  // 手刹按住但方向盘是正的，不算漂移——直道上搓方向不该出气。
  const wantDrift = Boolean(input.drift) && kart.speed > 6 && Math.abs(steer) > 0.15;

  if (wantDrift && !kart.drifting) {
    kart.drifting = true;
    if (kart.comboTimer > 0) {
      kart.charge = CARRY;
      kart.chain += 1;
      emit('chain', { chain: kart.chain });
    } else {
      kart.charge = 0;
      kart.chain = 0;
    }
    emit('driftStart');
  } else if (!wantDrift && kart.drifting) {
    kart.drifting = false;
    const tier = tierOf(kart.charge);
    if (tier > 0) {
      if (kart.tokens.length >= TOKEN_MAX) kart.tokens.shift();
      kart.tokens.push(tier);
      kart.comboTimer = COMBO_WINDOW;
      emit('ready', { tier, chain: kart.chain });
    } else {
      // 气没攒够就松手：这一段弯白漂了，连喷账也一起断。
      kart.comboTimer = 0;
      kart.chain = 0;
      if (kart.charge > 0.08) emit('fizzle');
    }
    kart.charge = 0;
  }

  if (input.boost) {
    if (kart.tokens.length > 0) {
      const tier = takeToken(kart.tokens);
      kart.boostTier = tier;
      kart.boostTime = BOOST_TIME[tier - 1];
      kart.boosts += 1;
      emit('boost', { tier, chain: kart.chain });
    } else {
      emit('deny');
    }
  }

  // 速度上限是这游戏所有惩罚和奖励的唯一出口：草地、漂移、抢跑罚站各压一刀，喷射和尾流抬一手。
  let cap = MAX_SPEED;
  if (kart.offTrack) cap = GRASS_SPEED;
  if (kart.boostTime > 0) cap = kart.offTrack ? GRASS_SPEED * 1.7 : BOOST_SPEED;
  if (kart.drifting) cap *= 1 - DRIFT_SCRUB * clamp(Math.abs(kart.driftAngle) / DRIFT_MAX, 0, 1);
  if (kart.draft && kart.boostTime <= 0 && !kart.offTrack) cap *= DRAFT_GAIN;
  if (kart.stall > 0) cap = Math.min(cap, MAX_SPEED * STALL_SPEED);

  if (kart.speed < cap) {
    kart.speed = Math.min(cap, kart.speed + (kart.boostTime > 0 ? BOOST_ACCEL : ACCEL) * dt);
  } else {
    kart.speed = Math.max(cap, kart.speed - OVER_DRAG * dt);
  }

  const turn = (kart.drifting ? DRIFT_TURN : GRIP_TURN) * turnScale(kart.speed);
  kart.heading = wrapAngle(kart.heading + steer * turn * dt);

  const chase = (kart.drifting ? COURSE_DRIFT : COURSE_GRIP) * dt;
  // 漂移时速度方向要追的不是车头，而是「车头往回让出一个漂移角」的方向：
  // 方向盘打多深，车尾就甩多横。松手改追车头，0.1 秒内重新咬地。
  const want = wrapAngle(kart.heading - (kart.drifting ? steer * DRIFT_MAX : 0));
  const diff = wrapAngle(want - kart.course);
  kart.course = wrapAngle(kart.course + clamp(diff, -chase, chase));
  let drift = wrapAngle(kart.heading - kart.course);
  if (Math.abs(drift) > DRIFT_MAX) {
    drift = Math.sign(drift) * DRIFT_MAX;
    kart.course = wrapAngle(kart.heading - drift);
  }
  if (kart.speed < 4) {
    kart.course = kart.heading;
    drift = 0;
  }
  kart.driftAngle = drift;

  kart.x += Math.cos(kart.course) * kart.speed * dt;
  kart.y += Math.sin(kart.course) * kart.speed * dt;

  const prevS = kart.s;
  const hit = course.project(kart.x, kart.y, kart.node);
  kart.node = hit.index;
  kart.s = hit.s;
  kart.lateral = hit.lateral;

  const wasOff = kart.offTrack;
  kart.offTrack = Math.abs(kart.lateral) > course.half;
  if (kart.offTrack) {
    kart.grassTime += dt;
    if (!wasOff) emit('grass');
  }

  const limit = course.half + SHOULDER;
  if (Math.abs(kart.lateral) > limit) {
    const side = Math.sign(kart.lateral);
    const node = course.node(kart.node);
    const push = Math.abs(kart.lateral) - limit;
    kart.x += Math.sin(node.heading) * side * push;
    kart.y -= Math.cos(node.heading) * side * push;
    kart.lateral = side * limit;
    // 车头往赛道里掰：不是掰成和墙平行，而是**带一点内切角**。
    // 只掰成平行的话，弯道会让车每一帧重新撞一次，人就被钉死在墙上了。
    const inward = wrapAngle(node.heading - side * WALL_TURN_IN);
    kart.heading = wrapAngle(kart.heading + wrapAngle(inward - kart.heading) * 0.5);
    kart.course = kart.heading;
    if (kart.wallCool <= 0) {
      // 撞一下很疼（速度砍半），但保底还能开走——这游戏没有倒车。
      kart.speed = Math.max(kart.speed * WALL_KEEP, WALL_MIN);
      kart.wallCool = WALL_COOL;
      kart.wallHits += 1;
      emit('wall');
    } else {
      kart.speed = Math.max(kart.speed, WALL_MIN);
    }
  }

  if (kart.drifting) {
    kart.driftTime += dt;
    const bite = clamp(Math.abs(kart.driftAngle) / DRIFT_MAX, 0, 1);
    if (!kart.offTrack && Math.abs(kart.driftAngle) > DRIFT_MIN) {
      const before = tierOf(kart.charge);
      kart.charge = Math.min(CHARGE_MAX, kart.charge + CHARGE_RATE * (kart.speed / MAX_SPEED) * bite * dt);
      const after = tierOf(kart.charge);
      if (after > before) emit('tier', { tier: after });
    } else if (kart.offTrack) {
      // 草地上漂移是净亏：轮子抓不住地，气反而在漏。
      kart.charge = Math.max(0, kart.charge - CHARGE_RATE * dt);
    }
  }

  const total = course.length;
  let ds = kart.s - prevS;
  if (ds > total / 2) ds -= total;
  if (ds < -total / 2) ds += total;
  kart.progress += ds;

  const lap = Math.floor(kart.progress / total);
  if (lap > kart.lap) {
    // lap 0 是「冲过起跑线」，不是跑完一圈：这里只给圈表起表，不记成绩。
    if (lap > 0) {
      const split = now - kart.lapStart;
      kart.lapTimes.push(split);
      if (!kart.best || split < kart.best) kart.best = split;
      emit('lap', { lap, split });
    }
    kart.lapStart = now;
    kart.lap = lap;
  } else if (lap < kart.lap) {
    kart.lap = lap;
  }

  return kart;
}

/**
 * 车与车的碰撞。只做「推开 + 各掉 6% 速度」这一件事：
 * 卡丁车里撞人不该是击杀手段，但**挤在弯心那一下要有代价**，不然大家都走同一条内线。
 */
export function resolveBumps(karts, effects, dt = 0) {
  for (const kart of karts) if (kart.bumpCool > 0) kart.bumpCool = Math.max(0, kart.bumpCool - dt);
  for (let i = 0; i < karts.length; i += 1) {
    for (let j = i + 1; j < karts.length; j += 1) {
      const a = karts[i];
      const b = karts[j];
      if (a.finished || b.finished) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = BODY * 2;
      if (dist >= min || dist === 0) continue;
      const push = (min - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      // 法向的接近速度。分开得慢只是贴着跑，撞上去才扣速度。
      const closing =
        (Math.cos(a.course) * a.speed - Math.cos(b.course) * b.speed) * nx +
        (Math.sin(a.course) * a.speed - Math.sin(b.course) * b.speed) * ny;
      if (closing < BUMP_CLOSING || a.bumpCool > 0 || b.bumpCool > 0) continue;
      a.speed *= BUMP_KEEP;
      b.speed *= BUMP_KEEP;
      a.bumpCool = BUMP_COOL;
      b.bumpCool = BUMP_COOL;
      effects.push({ type: 'bump', kart: a.id, other: b.id, self: a.id === 0 || b.id === 0 });
    }
  }
}


