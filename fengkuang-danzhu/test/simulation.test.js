import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_SPEED,
  COLUMNS,
  FIRE_INTERVAL,
  GRID_ROWS,
  LAUNCH_Y,
  STARTING_BALLS,
  START_ROWS,
  TURN_LIMIT,
} from '../src/game/rules.js';
import { brick, plus } from '../src/game/bricks.js';
import { countCells, setCell } from '../src/game/grid.js';
import { DEFAULT_AIM } from '../src/game/aim.js';
import {
  EMPTY_INPUT,
  STEP,
  ballsInFlight,
  bricksLeft,
  createGame,
  fire,
  restart,
  startGame,
  step,
  togglePause,
  updateAim,
} from '../src/game/simulation.js';

const AIM_UP = { aimAt: { x: COLUMNS / 2, y: 0 }, nudge: 0, fire: false };
const FIRE_UP = { ...AIM_UP, fire: true };

const blank = () => Array.from({ length: GRID_ROWS }, () => Array.from({ length: COLUMNS }, () => null));

// 一直空推到回合结束（回到瞄准阶段），返回收束后的状态。
const settle = (state, limit = 4000) => {
  let next = state;
  for (let i = 0; i < limit && next.phase !== 'aim' && next.status === 'playing'; i += 1) {
    next = step(next, EMPTY_INPUT, STEP);
  }
  return next;
};

test('开局停在瞄准阶段，一颗弹珠、几行砖', () => {
  const game = createGame(7);
  assert.equal(game.status, 'ready');
  assert.equal(game.phase, 'aim');
  assert.equal(game.ballCount, STARTING_BALLS);
  assert.equal(game.turn, 1);
  assert.deepEqual(game.aim, DEFAULT_AIM);
  assert.equal(game.launcher.x, COLUMNS / 2);
  assert.ok(countCells(game.grid) > 0);
  assert.ok(game.grid.slice(START_ROWS).every((row) => row.every((cell) => cell === null)));
});

test('非 playing 状态不推进', () => {
  const game = createGame(7);
  assert.equal(step(game, FIRE_UP, STEP), game, 'ready 交给 UI 决定何时开始');
  const paused = togglePause(startGame(7));
  assert.equal(step(paused, FIRE_UP, STEP), paused);
});

test('瞄准只在瞄准阶段生效，键盘微调按角速度走', () => {
  const game = startGame(7);
  const aimed = step(game, { aimAt: { x: 0, y: 0 }, nudge: 0, fire: false }, STEP);
  assert.ok(aimed.aim.x < 0, '指向左上角');
  const nudged = updateAim(game, { aimAt: null, nudge: 1 }, 0.5);
  assert.ok(nudged.aim.x > 0, '按住右键往右拧');
  const flying = fire(game);
  assert.equal(updateAim(flying, { aimAt: { x: 0, y: 0 }, nudge: 0 }, STEP), flying, '飞行中不能改方向');
});

test('开火锁定这一串的弹珠数，按间隔一颗颗放出去', () => {
  const base = { ...startGame(7), ballCount: 3 };
  let state = step(base, FIRE_UP, STEP);
  assert.equal(state.phase, 'fire');
  assert.equal(state.queued + state.balls.length, 3);
  assert.equal(ballsInFlight(state), 3);
  assert.equal(state.balls.length, 1, '第一颗立刻出膛');
  assert.ok(Math.abs(Math.hypot(state.balls[0].vx, state.balls[0].vy) - BALL_SPEED) < 1e-9);
  assert.ok(state.balls[0].y < LAUNCH_Y);

  // 再推一个发射间隔，第二颗应该已经出来了。
  const frames = Math.ceil(FIRE_INTERVAL / STEP);
  for (let i = 0; i < frames; i += 1) state = step(state, EMPTY_INPUT, STEP);
  assert.ok(state.balls.length >= 2, `间隔后应有第二颗，实际 ${state.balls.length}`);
  assert.equal(fire(state), state, '飞行中再开火没有作用');
});

test('砖块要挨够下数才碎，撞击和拆砖都给分', () => {
  const soft = setCell(blank(), 3, 8, brick(1));
  const one = settle(step({ ...startGame(7), grid: soft, ballCount: 1 }, FIRE_UP, STEP));
  assert.ok(one.score > 0);
  assert.equal(one.destroyed, 1, '一血砖一下就碎');

  const tough = setCell(blank(), 3, 8, brick(2));
  const still = settle(step({ ...startGame(7), grid: tough, ballCount: 1 }, FIRE_UP, STEP));
  assert.equal(still.destroyed, 0, '两血砖一颗弹珠打不碎');
  assert.ok(still.score > 0, '没碎也有撞击分');
  assert.equal(bricksLeft({ ...still, grid: tough }), 1, 'bricksLeft 只数砖不数加珠');
});

test('吃到加珠当场加一颗，下一回合才用上', () => {
  const grid = setCell(blank(), 3, 8, plus());
  const state = { ...startGame(7), grid, ballCount: 1 };
  const fired = step(state, FIRE_UP, STEP);
  assert.equal(fired.queued + fired.balls.length, 1, '这一串仍然只有一颗');
  const settled = settle(fired);
  assert.ok(settled.pickups >= 1);
  assert.ok(settled.ballCount >= 2, '下回合弹珠变多');
});

test('回合结束时挪发射点、下压一行、回合数加一', () => {
  const state = { ...startGame(11), grid: blank() };
  const settled = settle(step(state, { aimAt: { x: 6, y: 2 }, nudge: 0, fire: true }, STEP));
  assert.equal(settled.phase, 'aim');
  assert.equal(settled.turn, 2);
  assert.equal(settled.balls.length, 0);
  assert.equal(settled.queued, 0);
  assert.ok(countCells(settled.grid) > 0, '空场也会挤进新的一行');
  assert.ok(settled.grid[0].some(Boolean), '新行在最上面');
  assert.notEqual(settled.launcher.x, state.launcher.x, '发射点跟着第一颗落地的弹珠走');
  assert.equal(settled.lastTurn.turn, 1);
});

test('砖块压过底线就结束', () => {
  const grid = setCell(blank(), 2, GRID_ROWS - 1, brick(9));
  const state = { ...startGame(11), grid };
  const settled = settle(step(state, FIRE_UP, STEP));
  assert.equal(settled.status, 'over');
  assert.ok(settled.effects.some((effect) => effect.type === 'over' && effect.reason === 'overflow'));
});

test('回合超时会把弹珠拽下来，不会卡住不动', () => {
  // 造一颗几乎水平的球：没有超时拉拽它会一直在两边墙之间来回。
  const state = {
    ...startGame(3),
    grid: blank(),
    phase: 'fire',
    queued: 0,
    balls: [{ x: 3.5, y: 6, vx: BALL_SPEED, vy: -0.0001 }],
    turnElapsed: 0,
  };
  let next = state;
  const frames = Math.ceil((TURN_LIMIT + 6) / STEP);
  for (let i = 0; i < frames && next.phase !== 'aim'; i += 1) next = step(next, EMPTY_INPUT, STEP);
  assert.equal(next.phase, 'aim', '超时拉拽保证回合一定收得住');
  assert.ok(next.turn > state.turn);
});

test('同 seed 同输入逐字段一致，重开会换一局', () => {
  const inputs = Array.from({ length: 900 }, (_, i) => ({
    aimAt: { x: 1 + (i % 5), y: 1 + (i % 3) },
    nudge: 0,
    fire: i % 150 === 0,
  }));
  const run = () => {
    let state = startGame(2024);
    for (const input of inputs) state = step(state, input, STEP);
    return state;
  };
  assert.deepEqual(run(), run());
  const first = startGame(5);
  assert.notEqual(restart(first).seed, first.seed);
});

test('每颗球出膛都发一条 launch：那串「哒哒哒」是反馈层唯一的依据', () => {
  // 开局只有一颗，看不出那串节奏，所以手动攒一串再射。
  const volley = 6;
  let state = fire({ ...startGame(3), ballCount: volley });
  const launched = [];
  const frames = Math.ceil((volley * FIRE_INTERVAL) / STEP) + 4;
  for (let i = 0; i < frames; i += 1) {
    state = step(state, EMPTY_INPUT, STEP);
    for (const effect of state.effects) if (effect.type === 'launch') launched.push(effect);
    if (state.phase === 'aim') break;
  }
  assert.equal(launched.length, volley, '出膛条数要和这一串的弹珠数对得上');
  assert.equal(launched.at(-1).remaining, 0, '最后一颗出膛后就没有排队的了');
  for (let i = 1; i < launched.length; i += 1) {
    assert.ok(launched[i].remaining < launched[i - 1].remaining, 'remaining 应该一路递减');
  }
  assert.equal(step(startGame(3), EMPTY_INPUT, STEP).effects.length, 0, '没开火就不该有出膛声');
});


