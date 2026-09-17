// 一局比赛的判定层。没有 DOM、没有随机源以外的不确定性：
// 同一关 + 同一串输入 = 同一个结果，所以机器人能把八关跑上几百遍当回归测试。
//
// 状态机沿用这个仓库里其它闯关游戏的那一套：
// ready → playing →（clear / down / over / won），paused 挂在 playing 上。
// 读秒不是一个独立状态，而是 playing 里的 countdown 字段——
// 因为弹射起步是**读秒期间的一次操作**，它必须和正赛走同一个 step，
// 否则「抢跑罚站」这条判定就得在两个地方各写一份。

import { COUNTDOWN, DRAFT_RANGE, LAUNCH_WINDOW, BOOST_TIME, STALL_TIME } from './rules.js';
import { EMPTY_INPUT, createKart, placeKart, resolveBumps, stepKart } from './kart.js';
import { botInput } from './bots.js';
import { LEVELS, LEVEL_COUNT, PLAYER_COLOR, RIVALS, buildLevel, starsFor } from './tracks.js';

export const HUMAN = 0;

export function createGame(levelIndex = 0, attempt = 0, carry = {}) {
  const level = buildLevel(levelIndex);
  const course = level.course;
  const total = level.rivals + 1;

  const karts = [createKart({ id: HUMAN, name: '我', color: PLAYER_COLOR, bot: false, skill: 1 })];
  for (let i = 0; i < level.rivals; i += 1) {
    const rival = RIVALS[i % RIVALS.length];
    karts.push(createKart({ id: i + 1, name: rival.name, color: rival.color, skill: level.rivalSkill }));
  }

  // 玩家发在**最后一排**：这游戏的过关条件是名次，所以每一关都从「要超几个人」开始。
  const slots = [...karts.keys()].sort((a, b) => (a === HUMAN ? 1 : b === HUMAN ? -1 : a - b));
  slots.forEach((kartIndex, slot) => {
    placeKart(karts[kartIndex], course, Math.floor(slot / 2), slot % 2 === 0 ? -1 : 1);
  });

  const state = {
    levelIndex,
    levelKey: level.key,
    level,
    attempt,
    total,
    status: 'ready',
    countdown: COUNTDOWN,
    time: 0,
    tick: 0,
    karts,
    finishOrder: [],
    effects: [],
    lives: carry.lives ?? 3,
    score: carry.score ?? 0,
    totalStars: carry.totalStars ?? 0,
    stars: 0,
    rank: total,
    lastRank: total,
    earned: 0,
  };
  // 读秒期间 HUD 就该显示「第 6 名」——发车位本身就是名次，不该等灯灭才算第一次。
  rankKarts(state);
  state.rank = karts[HUMAN].rank;
  state.lastRank = state.rank;
  return state;
}

export function startGame(levelIndex = 0, attempt = 0, carry = {}) {
  const state = createGame(levelIndex, attempt, carry);
  state.status = 'playing';
  return state;
}

export function retryLevel(state) {
  return startGame(state.levelIndex, state.attempt + 1, {
    lives: state.lives,
    score: state.score,
    totalStars: state.totalStars,
  });
}

export function advance(state) {
  const next = Math.min(LEVEL_COUNT - 1, state.levelIndex + 1);
  if (state.levelIndex + 1 >= LEVEL_COUNT) return startGame(0, 0);
  return startGame(next, state.attempt, {
    lives: state.lives,
    score: state.score,
    totalStars: state.totalStars,
  });
}

export function togglePause(state) {
  if (state.status === 'playing') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'playing';
  return state;
}

const inputFor = (state, kart) => {
  if (!kart.bot) return null;
  return botInput(kart, state.level.course, {
    skill: kart.skill,
    countdown: state.countdown,
    tick: state.tick,
    seed: state.attempt,
  });
};

/**
 * 标记尾流。判定很粗：正前方 14 米内、横向不超过 3 米、朝向大致相同，就算吃到。
 * 粗是故意的——玩家能自己看出「我贴上去了」，不需要一条只有代码知道的精确条件。
 */
function markDraft(karts, dt) {
  for (const kart of karts) {
    kart.draft = false;
    if (kart.finished) continue;
    for (const other of karts) {
      if (other === kart) continue;
      const dx = other.x - kart.x;
      const dy = other.y - kart.y;
      const dist = Math.hypot(dx, dy);
      if (dist > DRAFT_RANGE || dist < 1) continue;
      const ahead = Math.cos(kart.course) * dx + Math.sin(kart.course) * dy;
      const side = -Math.sin(kart.course) * dx + Math.cos(kart.course) * dy;
      if (ahead > 2 && Math.abs(side) < 3) {
        kart.draft = true;
        kart.draftTime += dt;
        break;
      }
    }
  }
}

/** 名次 = 按里程排；已完赛的按过线顺序钉死在前面，不再参与比较。 */
function rankKarts(state) {
  const order = [...state.karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  order.forEach((kart, index) => {
    kart.rank = index + 1;
  });
  return order;
}

/**
 * 弹射起步的判定。读秒最后 LAUNCH_WINDOW 秒内按喷是满喷起步，早一点就是抢跑罚站——
 * 同一颗按钮、同一个判定，差别只在按下的时刻，所以这条规则值得一个专门的测试。
 */
function judgeLaunch(state, kart) {
  if (kart.launch) return;
  kart.launch = state.countdown <= LAUNCH_WINDOW ? 'perfect' : 'early';
  state.effects.push({
    type: kart.launch === 'perfect' ? 'launchPerfect' : 'launchEarly',
    kart: kart.id,
    self: kart.id === HUMAN,
  });
}

function releaseLaunch(state) {
  for (const kart of state.karts) {
    if (kart.launch === 'perfect') {
      kart.boostTier = 3;
      kart.boostTime = BOOST_TIME[2];
      kart.boosts += 1;
    } else if (kart.launch === 'early') {
      kart.stall = STALL_TIME;
    }
  }
}

function settle(state, cleared, rank) {
  if (cleared) {
    state.stars = starsFor(rank);
    state.totalStars += state.stars;
    const me = state.karts[HUMAN];
    const left = Math.max(0, state.level.time - state.time);
    // 分数把名次、剩余时间和**漂了多久**记在一起。漂移分不是装饰：
    // 它是这游戏唯一的进度来源，所以「稳稳跟着车队混过线」该比「一路连喷杀出来」拿得少。
    state.earned = 600 * state.stars + Math.round(left * 10) + Math.round(me.driftTime * 20) + me.boosts * 30;
    state.score += state.earned;
    state.status = state.levelIndex + 1 >= LEVEL_COUNT ? 'won' : 'clear';
  } else {
    state.stars = 0;
    state.earned = 0;
    state.lives -= 1;
    state.status = state.lives > 0 ? 'down' : 'over';
  }
  return state;
}

/** 原地推进（mutable）。React 侧要记得 setView({ ...state })，否则引用没变会让 setState 整帧跳过。 */
export function step(state, input, dt) {
  state.effects.length = 0;
  if (state.status !== 'playing') return state;
  state.tick += 1;

  const course = state.level.course;

  if (state.countdown > 0) {
    const was = Math.ceil(state.countdown);
    state.countdown = Math.max(0, state.countdown - dt);
    const now = Math.ceil(state.countdown);
    if (now !== was) state.effects.push({ type: 'count', n: now, self: true });
    for (const kart of state.karts) {
      const cmd = inputFor(state, kart) ?? input ?? EMPTY_INPUT;
      if (cmd.boost) judgeLaunch(state, kart);
    }
    // 灯一灭就把起步的账结掉：满喷的当场推出去，抢跑的原地罚站。
    if (state.countdown === 0) releaseLaunch(state);
    return state;
  }

  state.time += dt;
  markDraft(state.karts, dt);
  for (const kart of state.karts) {
    if (kart.finished) continue;
    const cmd = inputFor(state, kart) ?? input ?? EMPTY_INPUT;
    stepKart(kart, cmd, dt, course, state.effects, state.time);
  }
  resolveBumps(state.karts, state.effects, dt);

  const goal = course.length * state.level.laps;
  for (const kart of state.karts) {
    if (kart.finished || kart.progress < goal) continue;
    kart.finished = true;
    kart.finishTime = state.time;
    state.finishOrder.push(kart.id);
    state.effects.push({ type: 'finish', kart: kart.id, self: kart.id === HUMAN });
  }

  rankKarts(state);
  const me = state.karts[HUMAN];
  state.rank = me.rank;
  if (state.rank !== state.lastRank) {
    // 超人和被超在画面上都只是一辆车擦过去，方向完全相反——所以它们是两个事件，不是一个。
    state.effects.push({
      type: state.rank < state.lastRank ? 'overtake' : 'passed',
      kart: HUMAN,
      self: true,
      rank: state.rank,
    });
    state.lastRank = state.rank;
  }

  if (me.finished) return settle(state, me.rank <= state.level.qualify, me.rank);
  if (state.time >= state.level.time) return settle(state, false, state.rank);
  return state;
}

export { LEVELS, LEVEL_COUNT };

