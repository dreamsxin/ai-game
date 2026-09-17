// 一局比赛的状态机。这里守的是「一关是怎么开始、怎么结束、结束之后账怎么算」，
// 其中弹射起步是唯一一处**按钮按下的时刻**本身就是判定的地方，值得专门盯着。

import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOST_TIME, COUNTDOWN, LAUNCH_WINDOW, STALL_TIME, STEP } from '../src/game/rules.js';
import { HUMAN, advance, createGame, retryLevel, startGame, step, togglePause } from '../src/game/simulation.js';
import { LEVEL_COUNT } from '../src/game/tracks.js';

const idle = { steer: 0, drift: false, boost: false };

/** 空跑若干秒。input 每帧都一样，够用来验状态机。 */
const run = (state, seconds, input = idle) => {
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames && state.status === 'playing'; i += 1) step(state, input, STEP);
  return state;
};

test('发车阵型：玩家发在最后一排，起跑线后面的里程是负的', () => {
  const state = startGame(2, 0);
  const me = state.karts[HUMAN];
  assert.equal(state.karts.length, state.level.rivals + 1);
  assert.ok(me.progress < 0, '玩家该在起跑线后面');
  for (const kart of state.karts) {
    if (kart.id === HUMAN) continue;
    assert.ok(kart.progress >= me.progress, `${kart.name} 竟然发在玩家后面`);
  }
  assert.equal(me.rank, state.total, '开局名次就是最后一名');
});

test('读秒：三声短一声长，读秒期间车不动', () => {
  const state = startGame(0, 0);
  const beeps = [];
  const frames = Math.round(COUNTDOWN / STEP) + 1;
  for (let i = 0; i < frames; i += 1) {
    step(state, idle, STEP);
    for (const effect of state.effects) if (effect.type === 'count') beeps.push(effect.n);
  }
  assert.deepEqual(beeps, [3, 2, 1, 0]);
  assert.equal(state.karts[HUMAN].speed, 0, '灯没灭就不该动');
  assert.equal(state.time, 0, '正赛计时从灯灭开始');
});

test('弹射起步：窗口内按是满喷，早一点按是罚站', () => {
  const good = startGame(0, 0);
  run(good, COUNTDOWN - LAUNCH_WINDOW * 0.5);
  step(good, { ...idle, boost: true }, STEP);
  assert.equal(good.karts[HUMAN].launch, 'perfect');
  run(good, good.countdown + STEP);
  assert.equal(good.karts[HUMAN].boostTime > 0, true);
  assert.equal(good.karts[HUMAN].boostTier, 3);

  const early = startGame(0, 0);
  step(early, { ...idle, boost: true }, STEP);
  assert.equal(early.karts[HUMAN].launch, 'early');
  run(early, early.countdown + STEP);
  assert.equal(early.karts[HUMAN].stall, STALL_TIME);
  assert.equal(early.karts[HUMAN].boostTime, 0);

  // 同一局里第一次按下就定性，之后再按不改判。
  step(early, { ...idle, boost: true }, STEP);
  assert.equal(early.karts[HUMAN].launch, 'early');
  assert.equal(BOOST_TIME.length, 3);
});

test('名次变化会分成「超掉别人」和「被别人超掉」两个事件', () => {
  const state = startGame(0, 0);
  state.countdown = 0;
  const me = state.karts[HUMAN];

  // 一步跨到所有人前面：这一帧该报「超掉了」。
  me.progress = 400;
  step(state, idle, STEP);
  assert.equal(state.rank, 1);
  const up = state.effects.filter((effect) => effect.type === 'overtake' || effect.type === 'passed');
  assert.deepEqual(up.map((effect) => effect.type), ['overtake']);

  // 再掉回最后：同一套逻辑必须报出**相反**的那个事件，而不是一个笼统的「名次变了」。
  me.progress = -60;
  step(state, idle, STEP);
  assert.equal(state.rank, state.total);
  const down = state.effects.filter((effect) => effect.type === 'overtake' || effect.type === 'passed');
  assert.deepEqual(down.map((effect) => effect.type), ['passed']);
});

test('时限到了没跑完就丢一次机会，机会用光才结束', () => {
  const state = startGame(0, 0);
  state.countdown = 0;
  state.lives = 2;
  state.time = state.level.time - 0.05;
  run(state, 0.2);
  assert.equal(state.status, 'down');
  assert.equal(state.lives, 1);
  assert.equal(state.stars, 0);

  const last = startGame(0, 0);
  last.countdown = 0;
  last.lives = 1;
  last.time = last.level.time - 0.05;
  run(last, 0.2);
  assert.equal(last.status, 'over');
});

test('达标就结算：星星按名次，分数把名次、剩余时间和漂移时长都算进去', () => {
  const state = startGame(0, 0);
  const me = state.karts[HUMAN];
  // 直接把玩家推过终点线，看结算这一段。
  me.progress = state.level.course.length * state.level.laps + 1;
  me.driftTime = 10;
  me.boosts = 4;
  state.countdown = 0;
  state.time = 30;
  step(state, idle, STEP);
  assert.equal(state.status, 'clear');
  assert.equal(state.rank, 1);
  assert.equal(state.stars, 3);
  assert.ok(state.earned > 600 * 3, '分数里该有时间和漂移的部分');
  assert.equal(state.score, state.earned);
  assert.equal(state.totalStars, 3);
});

test('最后一关达标是 won，中间关是 clear，advance 会带着分数和命数走', () => {
  const last = startGame(LEVEL_COUNT - 1, 0);
  const me = last.karts[HUMAN];
  me.progress = last.level.course.length * last.level.laps + 1;
  last.countdown = 0;
  step(last, idle, STEP);
  assert.equal(last.status, 'won');

  const mid = startGame(0, 0);
  mid.karts[HUMAN].progress = mid.level.course.length * mid.level.laps + 1;
  mid.countdown = 0;
  step(mid, idle, STEP);
  assert.equal(mid.status, 'clear');
  const next = advance(mid);
  assert.equal(next.levelIndex, 1);
  assert.equal(next.score, mid.score);
  assert.equal(next.totalStars, mid.totalStars);
  assert.equal(next.lives, mid.lives);
});

test('重开这一关换的是对手的失误，不是赛道', () => {
  const first = startGame(3, 0);
  const again = retryLevel(first);
  assert.equal(again.attempt, 1);
  assert.equal(again.level.course, first.level.course, '赛道是固定的');
  assert.equal(again.lives, first.lives);
});

test('暂停冻结一切：状态不是 playing 时 step 不推进也不产生事件', () => {
  const state = startGame(0, 0);
  run(state, COUNTDOWN + 2);
  const before = state.karts[HUMAN].progress;
  togglePause(state);
  assert.equal(state.status, 'paused');
  run(state, 2);
  assert.equal(state.karts[HUMAN].progress, before);
  assert.equal(state.effects.length, 0);
  togglePause(state);
  assert.equal(state.status, 'playing');
});

test('新建的一局是 ready，没开始之前也不会自己跑', () => {
  const state = createGame(0, 0);
  assert.equal(state.status, 'ready');
  step(state, idle, STEP);
  assert.equal(state.time, 0);
  assert.equal(state.countdown, COUNTDOWN);
});
