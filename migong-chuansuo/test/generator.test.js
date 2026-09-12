import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, WARP } from '../src/game/rules.js';
import { canReach } from '../src/game/grid.js';
import { replay } from '../src/game/solver.js';
import {
  generateCampaignLevel,
  generateLevel,
  levelMetrics,
  validateLevel,
} from '../src/game/generator.js';

test('同一个 seed 生成逐字段一致的关卡', () => {
  const a = generateLevel({ seed: 12345, cols: 4, rows: 4, layers: 2, scramble: 4 });
  const b = generateLevel({ seed: 12345, cols: 4, rows: 4, layers: 2, scramble: 4 });
  assert.deepEqual(a.level, b.level);
});

test('解开态里全格连通，所以出口一定可达', () => {
  const { level } = generateLevel({ seed: 7, cols: 5, rows: 4, layers: 2, scramble: 4 });
  assert.ok(level, '生成失败');
  assert.equal(canReach(level.solvedBoard, level.solvedStart, level.exit), true);
});

test('初始态一定还没通关，否则关卡没有意义', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const { level } = generateLevel({ seed, cols: 4, rows: 4, layers: 1, scramble: 3 });
    assert.ok(level, `seed ${seed} 生成失败`);
    assert.equal(
      canReach(level.board, level.start, level.exit),
      false,
      `seed ${seed} 的初始态已经通关`,
    );
  }
});

test('保底解法真的能走通，可解性是构造出来的', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const { level } = generateLevel({ seed, cols: 5, rows: 4, layers: 2, scramble: 5 });
    assert.ok(level, `seed ${seed} 生成失败`);
    const end = replay(level.board, level.start, level.exit, level.solution);
    assert.equal(
      canReach(end.board, end.cell, end.exit),
      true,
      `seed ${seed} 的保底解法走不到出口`,
    );
  }
});

test('保底解法把砖面和站位都还原成解开态', () => {
  const { level } = generateLevel({ seed: 99, cols: 4, rows: 4, layers: 1, scramble: 4 });
  const end = replay(level.board, level.start, level.exit, level.solution);
  assert.deepEqual(end.board.tiles, level.solvedBoard.tiles);
  assert.deepEqual(end.cell, level.solvedStart);
});

test('par 不会超过保底解法长度，搜到更短解就用更短的', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const { level } = generateLevel({ seed, cols: 4, rows: 4, layers: 1, scramble: 4 });
    assert.ok(level.par >= 1, `seed ${seed} 的 par 是 ${level.par}`);
    assert.ok(level.par <= level.scramble, `seed ${seed} 的 par ${level.par} 超过打乱步数 ${level.scramble}`);
  }
});

test('多层关卡每对相邻层都有一对对齐的跃迁垫', () => {
  const { level } = generateLevel({ seed: 5, cols: 4, rows: 4, layers: 3, scramble: 1 });
  assert.equal(level.warps.length, 2);
  for (const warp of level.warps) {
    const index = warp.row * level.cols + warp.col;
    assert.ok(level.solvedBoard.tiles[warp.lower][index] & WARP);
    assert.ok(level.solvedBoard.tiles[warp.lower + 1][index] & WARP);
  }
});

test('单层关卡不放跃迁垫', () => {
  const { level } = generateLevel({ seed: 5, cols: 4, rows: 4, layers: 1, scramble: 2 });
  assert.equal(level.warps.length, 0);
  assert.equal(levelMetrics(level).warps, 0);
});

test('起点和出口取对角，解法必须横穿整张图', () => {
  const { level } = generateLevel({ seed: 21, cols: 5, rows: 5, layers: 2, scramble: 3 });
  assert.notEqual(level.solvedStart.col, level.exit.col);
  assert.notEqual(level.solvedStart.row, level.exit.row);
  assert.equal(level.solvedStart.layer, 0);
  assert.equal(level.exit.layer, level.layers - 1);
});

// 一百关全扫一遍，每关取 4 个 seed。再往上加 seed 数只是线性堆时间，
// 而生成失败一向是「配方本身偏了」而不是「某个 seed 不巧」，4 个足够把偏了的配方抓出来。
test('关卡表里每一关在连续 4 个 seed 上都生成通过', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { level, attempts, failures } = generateCampaignLevel(index, seed);
      assert.ok(level, `第 ${index + 1} 关 seed ${seed} 生成失败：${JSON.stringify(failures)}`);
      assert.ok(attempts <= 4, `第 ${index + 1} 关 seed ${seed} 重试了 ${attempts} 次`);
      assert.equal(validateLevel(level).ok, true);
    }
  }
});

// 头几关是新手关，最容易因为「打乱两步就已经通了」而换 seed 重试——3×3 上两次推移
// 常常自我抵消，这本来就是 generateLevel 换 seed 的用途。这里盯的是「24 个 seed 一个都不能
// 生成不出来」，重试次数只要不失控就行（一次 3×3 生成是微秒级）。
test('开局那几关在连续 24 个 seed 上都生成得出来', () => {
  for (let index = 0; index < 3; index += 1) {
    for (let seed = 1; seed <= 24; seed += 1) {
      const { level, attempts } = generateCampaignLevel(index, seed);
      assert.ok(level, `第 ${index + 1} 关 seed ${seed} 生成失败`);
      assert.ok(attempts <= 6, `第 ${index + 1} 关 seed ${seed} 重试了 ${attempts} 次`);
      assert.equal(validateLevel(level).ok, true);
    }
  }
});

test('难度曲线单调：越往后棋盘不变小、打乱不变少', () => {
  for (let index = 1; index < LEVELS.length; index += 1) {
    const previous = LEVELS[index - 1];
    const current = LEVELS[index];
    const area = (level) => level.cols * level.rows * level.layers;
    assert.ok(area(current) >= area(previous), `第 ${index + 1} 关比上一关小了`);
    assert.ok(current.scramble >= previous.scramble, `第 ${index + 1} 关打乱步数比上一关少了`);
    assert.ok(current.loops <= previous.loops + 1e-9, `第 ${index + 1} 关的额外开门率反而高了`);
  }
});


test('每格门数落在合理区间，不会全是墙也不会全通', () => {
  const metrics = levelMetrics(generateLevel({ seed: 3, cols: 5, rows: 5, layers: 1, scramble: 4 }).level);
  assert.ok(metrics.doorsPerCell > 1.4, `每格门数只有 ${metrics.doorsPerCell.toFixed(2)}`);
  assert.ok(metrics.doorsPerCell < 3.4, `每格门数高达 ${metrics.doorsPerCell.toFixed(2)}`);
});

test('体检能抓出被人为改坏的关卡', () => {
  const { level } = generateLevel({ seed: 8, cols: 4, rows: 4, layers: 1, scramble: 3 });
  const broken = { ...level, solution: [] };
  const report = validateLevel(broken);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.includes('保底解法')));
});
