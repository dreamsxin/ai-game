import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_ROWS, TURN_LIMIT } from '../src/game/rules.js';
import { lowestRow } from '../src/game/grid.js';
import { STEP, startGame, step } from '../src/game/simulation.js';

// 瞄最低那一排砖里最靠中间的一块，是这类玩法最朴素的打法。
function aimTarget(state) {
  const row = lowestRow(state.grid);
  if (row < 0) return { x: state.launcher.x, y: 0 };
  const cols = state.grid[row].map((cell, col) => (cell ? col : -1)).filter((col) => col >= 0);
  const pick = cols.reduce(
    (best, col) => (Math.abs(col + 0.5 - state.launcher.x) < Math.abs(best + 0.5 - state.launcher.x) ? col : best),
    cols[0],
  );
  return { x: pick + 0.5, y: row + 0.5 };
}

// 打完 turns 个回合或者输掉为止，同时盯住「每回合都必须收得住」。
function play(seed, turns = 25) {
  let state = startGame(seed);
  const maxFrames = Math.ceil((TURN_LIMIT + 4) / STEP);
  for (let turn = 0; turn < turns; turn += 1) {
    if (state.status !== 'playing') break;
    const target = aimTarget(state);
    state = step(state, { aimAt: target, nudge: 0, fire: true }, STEP);
    assert.equal(state.phase, 'fire', '按下开火就该进入飞行阶段');
    let frames = 0;
    while (state.status === 'playing' && state.phase !== 'aim') {
      state = step(state, { aimAt: null, nudge: 0, fire: false }, STEP);
      frames += 1;
      assert.ok(frames < maxFrames, `第 ${state.turn} 回合没能在 ${TURN_LIMIT + 4} 秒内收束`);
    }
  }
  return state;
}

test('机器人能靠瞄最低砖块撑过一段时间，弹珠会越打越多', () => {
  for (const seed of [1234, 99, 424242]) {
    const state = play(seed, 12);
    assert.ok(state.turn > 8, `seed ${seed} 只撑到第 ${state.turn} 回合`);
    assert.ok(state.ballCount > 1, `seed ${seed} 一颗加珠都没吃到`);
    assert.ok(state.score > 0);
    assert.ok(state.destroyed > 0);
  }
});

test('一直打下去最终会因为压到底线结束，而不是卡死', () => {
  const state = play(777, 200);
  assert.equal(state.status, 'over', `实际停在第 ${state.turn} 回合、状态 ${state.status}`);
  assert.ok(state.turn > 5, '不该刚开局就被压死');
  assert.equal(state.balls.length, 0, '结束时不该还有弹珠在飞');
});

test('砖块永远不会越过底线之后还留在场上', () => {
  const state = play(31337, 60);
  assert.ok(lowestRow(state.grid) <= GRID_ROWS - 1);
});
