import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, findMoves } from '../src/game/board.js';
import { clearScore } from '../src/game/rules.js';
import {
  EMPTY_INPUT,
  STEP,
  attemptSwap,
  createGame,
  legalMoves,
  nextLevel,
  retryLevel,
  startGame,
  step,
  togglePause,
} from '../src/game/simulation.js';

const tapInput = (cell) => ({ tap: cell, swipe: null });
const swipeInput = (from, dir) => ({ tap: null, swipe: { from, dir } });

// 一直推进到重新回到可操作状态，最多跑 600 帧防止测试挂死。
const settle = (state, frames = 600) => {
  let next = state;
  for (let i = 0; i < frames && next.phase !== 'idle'; i += 1) next = step(next, EMPTY_INPUT, STEP);
  return next;
};

const advance = (state, frames, input = EMPTY_INPUT) => {
  let next = state;
  for (let i = 0; i < frames; i += 1) next = step(next, input, STEP);
  return next;
};

// 贪心机器人：每步选立刻消掉最多果实的那次交换。
const bestMove = (state) => {
  const moves = findMoves(state.board);
  let best = null;
  for (const move of moves) {
    const tried = settle(attemptSwap(state, move.a, move.b));
    const gained = tried.score - state.score;
    if (!best || gained > best.gained) best = { move, gained };
  }
  return best?.move ?? null;
};

test('开局是待开始状态，棋盘干净且步数与关卡一致', () => {
  const state = createGame(2024);
  assert.equal(state.status, 'ready');
  assert.equal(state.phase, 'idle');
  assert.equal(state.moves, state.level.moves);
  assert.equal(state.score, 0);
  assert.equal(findMatches(state.board).length, 0, '开局不应有现成三连');
});

test('待开始和暂停状态下推进不改变棋局', () => {
  const ready = createGame(7);
  assert.deepEqual(advance(ready, 10, tapInput({ x: 0, y: 0 })), ready);
  const paused = togglePause(startGame(7));
  assert.deepEqual(advance(paused, 10), paused, '暂停时输入不生效');
});

test('换不出三连的交换会被退回且不扣步数', () => {
  const state = startGame(11);
  const moves = findMoves(state.board);
  const legal = new Set(moves.map((move) => `${move.a.x},${move.a.y}-${move.b.x},${move.b.y}`));
  let illegal = null;
  for (let y = 0; y < state.board.length && !illegal; y += 1) {
    for (let x = 0; x < state.board[y].length - 1 && !illegal; x += 1) {
      if (!legal.has(`${x},${y}-${x + 1},${y}`)) illegal = { a: { x, y }, b: { x: x + 1, y } };
    }
  }
  const rejected = attemptSwap(state, illegal.a, illegal.b);
  assert.equal(rejected.phase, 'reject');
  assert.equal(rejected.moves, state.moves, '非法交换不扣步数');
  const back = settle(rejected);
  assert.equal(back.score, 0, '非法交换不得分');
  assert.deepEqual(back.board, state.board, '棋盘应保持原样');
});

test('合法交换扣一步、消掉果实并给分', () => {
  const state = startGame(11);
  const move = legalMoves(state)[0];
  const swapping = attemptSwap(state, move.a, move.b);
  assert.equal(swapping.phase, 'swap');
  assert.equal(swapping.moves, state.moves - 1);
  const done = settle(swapping);
  assert.ok(done.score >= clearScore(3, 1), '至少要拿到一次三连的分');
  assert.ok(done.cleared >= 3);
  assert.equal(findMatches(done.board).length, 0, '结算后棋盘上不该留下三连');
  assert.ok(done.board.every((row) => row.every(Boolean)), '空位应被补满');
});

test('点两下相邻格子等于一次交换', () => {
  const state = startGame(11);
  const move = legalMoves(state)[0];
  const selected = step(state, tapInput(move.a), STEP);
  assert.deepEqual(selected.selected, move.a, '第一下只是选中');
  assert.equal(selected.moves, state.moves);
  const swapping = step(selected, tapInput(move.b), STEP);
  assert.equal(swapping.phase, 'swap');
  assert.equal(swapping.moves, state.moves - 1);
});

test('再点一次已选中的格子会取消选中', () => {
  const state = startGame(11);
  const cell = { x: 2, y: 3 };
  const selected = step(state, tapInput(cell), STEP);
  const cleared = step(selected, tapInput(cell), STEP);
  assert.equal(cleared.selected, null);
});

test('拖动手势按方向换位', () => {
  const state = startGame(11);
  const move = legalMoves(state)[0];
  const dir = { dx: move.b.x - move.a.x, dy: move.b.y - move.a.y };
  const swapping = step(state, swipeInput(move.a, dir), STEP);
  assert.equal(swapping.phase, 'swap');
  assert.deepEqual(swapping.swap.b, move.b);
});

test('连锁消除让倍率累加', () => {
  let state = startGame(11);
  for (let i = 0; i < 12 && state.bestChain < 2; i += 1) {
    const move = bestMove(state);
    if (!move) break;
    state = settle(attemptSwap(state, move.a, move.b));
  }
  assert.ok(state.bestChain >= 2, '十几步内应该出现过一次连锁');
});

test('达到目标分立刻过关并结算星级', () => {
  const base = startGame(11);
  const easy = { ...base, level: { ...base.level, target: 1, stars: [1, 2, 3] } };
  const move = legalMoves(easy)[0];
  const done = settle(attemptSwap(easy, move.a, move.b));
  assert.equal(done.status, 'won');
  assert.equal(done.stars, 3);
  assert.equal(done.selected, null);
});

test('步数用完且没达标就结束', () => {
  const base = startGame(11);
  const hard = { ...base, moves: 1, level: { ...base.level, target: 9_999_999 } };
  const move = legalMoves(hard)[0];
  const done = settle(attemptSwap(hard, move.a, move.b));
  assert.equal(done.status, 'over');
  assert.equal(done.stars, 0);
});

test('过关后进入下一关，失败后重试同一关', () => {
  const base = startGame(11);
  const won = { ...base, status: 'won', levelIndex: 0 };
  assert.equal(nextLevel(won).levelIndex, 1);
  assert.equal(nextLevel(won).status, 'playing');
  assert.equal(retryLevel(won).levelIndex, 0);
  assert.notEqual(retryLevel(won).seed, base.seed, '重试换一个 seed，避免重复同一盘');
});

test('同 seed 加同一串输入得到逐字段一致的结果', () => {
  const run = () => {
    let state = startGame(20240910, 1);
    for (let i = 0; i < 8; i += 1) {
      const move = findMoves(state.board)[0];
      if (!move) break;
      state = settle(attemptSwap(state, move.a, move.b));
    }
    return state;
  };
  const first = run();
  const second = run();
  assert.deepEqual(first.board, second.board);
  assert.equal(first.score, second.score);
  assert.equal(first.moves, second.moves);
  assert.equal(first.randomState, second.randomState);
});
