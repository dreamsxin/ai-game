import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels.js';
import { isSolid } from '../src/game/tiles.js';
import { STEP, startGame, step } from '../src/game/simulation.js';

// 一个只会往右跑、遇坑遇墙遇刺就跳的机器人。它能跑到旗杆，说明关卡地形过得去。
const solid = (grid, col, row) => isSolid(grid[row]?.[col] ?? ' ');

const decide = (state) => {
  const p = state.player;
  const foot = Math.floor(p.y + p.h + 0.1);
  const head = Math.floor(p.y + 0.2);
  const ahead = Math.floor(p.x + p.w + 0.6);
  let jump = false;
  if (!solid(state.grid, ahead, foot) || !solid(state.grid, ahead + 1, foot)) jump = true;
  for (let col = ahead; col <= ahead + 1; col += 1) {
    for (let row = head; row <= foot - 1; row += 1) {
      if ((state.grid[row]?.[col] ?? ' ') === 'x') jump = true;
      if (col === ahead && solid(state.grid, col, row)) jump = true;
    }
  }
  // 头顶有砖块顶棚时先别跳，等跑出去再起跳。
  for (let row = head - 1; row >= head - 2; row -= 1) {
    for (let col = Math.floor(p.x); col <= Math.floor(p.x + p.w); col += 1) {
      if (solid(state.grid, col, row)) jump = false;
    }
  }
  return { jump: jump && p.grounded, held: { left: false, right: true, run: false, jump } };
};

for (const [index, level] of LEVELS.entries()) {
  test(`${level.key} ${level.name} 的地形可以一路跑到终点`, () => {
    // 去掉敌人只测地形：跳跃距离、坑宽和台阶高度都要过得去。
    let state = { ...startGame(index), enemies: [] };
    let frames = 0;
    while (frames < 60 * 200 && state.status === 'playing') {
      state = step(state, decide(state), STEP);
      frames += 1;
    }
    assert.equal(state.status, 'clear', `跑到 x=${state.player.x.toFixed(1)} 就卡住了`);
    assert.ok(state.score > 0, '一路上至少吃到一些分数');
  });
}
