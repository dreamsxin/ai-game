import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLabel,
  formatScore,
  formatTime,
  levelLabel,
  nextLevelLabel,
  previewCells,
  starLabel,
  statusLabel,
} from '../src/scene/readout.js';

test('分数和时间的展示格式', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(12345.9), '12,345');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(75.4), '01:15');
  assert.equal(formatTime(-3), '00:00');
});

test('等级文案跟着消行数走', () => {
  assert.equal(levelLabel(0), 'LV 1');
  assert.equal(levelLabel(25), 'LV 3');
  assert.equal(nextLevelLabel(7), '再消 3 行升级');
  assert.equal(nextLevelLabel(1000), '已达最高速度');
});

test('消行提示拼出 T-spin 与连击', () => {
  assert.equal(clearLabel(null), '');
  assert.equal(clearLabel({ count: 1, tspin: false, combo: 1 }), '单消');
  assert.equal(clearLabel({ count: 4, tspin: false, combo: 1 }), 'TETRIS');
  assert.equal(clearLabel({ count: 2, tspin: true, combo: 1 }), 'T-SPIN 双消');
  assert.equal(clearLabel({ count: 3, tspin: false, combo: 4 }), '三消 · 4 连击');
});

test('状态文案和星级', () => {
  assert.ok(statusLabel('ready').length > 0);
  assert.equal(statusLabel('paused'), '已暂停');
  assert.equal(statusLabel('unknown'), '');
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(2), '★★☆');
});

test('预览格子压到左上角并带尺寸', () => {
  const empty = previewCells(null);
  assert.deepEqual(empty.cells, []);

  const o = previewCells('O');
  assert.equal(o.cells.length, 4);
  assert.deepEqual(o.cells, [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(o.width, 2);
  assert.equal(o.height, 2);

  const i = previewCells('I');
  assert.equal(i.width, 4);
  assert.equal(i.height, 1);
  assert.ok(i.cells.every(([, y]) => y === 0), 'I 的预览应贴在第一行');
  assert.ok(i.color.startsWith('#'));
});
