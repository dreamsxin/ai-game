import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, findMoves } from '../src/game/board.js';
import { LEVELS } from '../src/game/levels.js';
import { EMPTY_INPUT, STEP, attemptSwap, startGame, step } from '../src/game/simulation.js';

const settle = (state, frames = 900) => {
  let next = state;
  for (let i = 0; i < frames && next.phase !== 'idle'; i += 1) next = step(next, EMPTY_INPUT, STEP);
  return next;
};

// 贪心机器人：把每个合法交换都试一遍，选立刻拿分最多的那一步。
const play = (levelIndex, seed) => {
  let state = startGame(seed, levelIndex);
  for (let turn = 0; turn < state.level.moves + 5; turn += 1) {
    if (state.status !== 'playing') break;
    const moves = findMoves(state.board);
    assert.ok(moves.length > 0, `第 ${levelIndex + 1} 关第 ${turn + 1} 步无路可走`);
    let best = null;
    for (const move of moves) {
      const tried = settle(attemptSwap(state, move.a, move.b));
      const gained = tried.score - state.score;
      if (!best || gained > best.gained) best = { gained, state: tried };
    }
    state = best.state;
    assert.equal(findMatches(state.board).length, 0, '每步结算后棋盘不该留下三连');
    assert.ok(state.board.every((row) => row.every(Boolean)), '每步结算后不该留下空位');
    assert.ok(state.phase === 'idle', '每步都要回到可操作状态');
  }
  return state;
};

// 关卡目标不能定得连贪心打法都过不去，这条测试防止关卡数据退化成死关。
for (const [index, level] of LEVELS.entries()) {
  test(`第 ${level.id} 关《${level.name}》能被贪心打法通关`, () => {
    for (const seed of [1000 + level.id * 31, 7 * level.id + 3, 90210 + level.id]) {
      const state = play(index, seed);
      assert.equal(state.status, 'won', `seed ${seed} 实际得分 ${state.score} / 目标 ${level.target}`);
      assert.ok(state.stars >= 1);
      assert.ok(state.moves >= 0, '步数不应变成负数');
    }
  });
}

test('步数耗尽且分数不够时正常结束而不是卡住', () => {
  const base = startGame(4321, 0);
  let state = { ...base, level: { ...base.level, target: 9_999_999 } };
  for (let turn = 0; turn < base.level.moves + 3 && state.status === 'playing'; turn += 1) {
    const move = findMoves(state.board)[0];
    state = settle(attemptSwap(state, move.a, move.b));
  }
  assert.equal(state.status, 'over');
  assert.equal(state.moves, 0);
});
