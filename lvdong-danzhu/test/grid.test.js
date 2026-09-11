import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, GRID_ROWS } from '../src/game/rules.js';
import { marble } from '../src/game/marbles.js';
import {
  clearCells,
  colorCounts,
  countMarbles,
  createGrid,
  damageCell,
  descend,
  floating,
  groupAt,
  isEmpty,
  lowestRow,
  spawnRow,
} from '../src/game/grid.js';

const blank = () => Array.from({ length: GRID_ROWS }, () => Array.from({ length: COLUMNS }, () => null));

test('开局只在顶部铺指定行数，颜色取自调色板', () => {
  const { grid } = createGrid(7, ['rose', 'mint'], 4);
  assert.equal(countMarbles(grid), 4 * COLUMNS);
  assert.ok(grid[3].every(Boolean));
  assert.ok(grid[4].every((cell) => cell === null), '第五行开始是空的');
  assert.ok(grid.flat().filter(Boolean).every((cell) => ['rose', 'mint'].includes(cell.color)));
});

test('同 seed 生成同一面墙', () => {
  const a = createGrid(99, ['rose', 'mint', 'azure'], 3);
  const b = createGrid(99, ['rose', 'mint', 'azure'], 3);
  assert.deepEqual(a.grid, b.grid);
  assert.equal(a.randomState, b.randomState);
});

test('同色连通块按四邻扩散，斜角不算', () => {
  const grid = blank();
  grid[0][0] = marble('rose');
  grid[0][1] = marble('rose');
  grid[1][1] = marble('rose');
  grid[2][2] = marble('rose');
  const group = groupAt(grid, 0, 0);
  assert.equal(group.length, 3);
  assert.equal(groupAt(grid, 2, 2).length, 1, '斜着挨着不连通');
  assert.deepEqual(groupAt(grid, 5, 5), [], '空格没有连通块');
});

test('异色打断连通块', () => {
  const grid = blank();
  grid[0][0] = marble('rose');
  grid[0][1] = marble('azure');
  grid[0][2] = marble('rose');
  assert.equal(groupAt(grid, 0, 0).length, 1);
});

test('挂不到第 0 行的弹珠会被判成要掉落', () => {
  const grid = blank();
  grid[0][4] = marble('rose');
  grid[1][4] = marble('mint');
  grid[5][0] = marble('azure');
  grid[5][1] = marble('azure');
  const loose = floating(grid);
  assert.equal(loose.length, 2);
  assert.ok(loose.every((spot) => spot.row === 5), '悬空的那两颗才掉');
});

test('顶行整排消掉后下面全部悬空', () => {
  const { grid } = createGrid(3, ['rose'], 3);
  const cleared = clearCells(grid, grid[0].map((_, col) => ({ col, row: 0 })));
  assert.equal(floating(cleared).length, 2 * COLUMNS);
});

test('整墙下压：新行进顶部，被顶出底行的算越线', () => {
  const grid = blank();
  grid[0][0] = marble('rose');
  const fresh = Array.from({ length: COLUMNS }, () => marble('mint'));
  const pushed = descend(grid, fresh);
  assert.equal(pushed.overflow, 0);
  assert.equal(pushed.grid[0][0].color, 'mint');
  assert.equal(pushed.grid[1][0].color, 'rose', '原来的第 0 行被推到第 1 行');

  const packed = blank();
  packed[GRID_ROWS - 1][3] = marble('rose');
  assert.equal(descend(packed, fresh).overflow, 1, '底行有弹珠就是越线');
});

test('砸裂只加伤害不删格子', () => {
  const grid = blank();
  grid[2][2] = marble('azure');
  const hit = damageCell(grid, 2, 2);
  assert.equal(hit.grid[2][2].damage, 1);
  assert.equal(grid[2][2].damage, 0, '原网格不被改写');
  assert.equal(damageCell(grid, 8, 8).grid, grid, '打空格什么都不变');
});

test('清空后 isEmpty 成立，lowestRow 退回 -1', () => {
  const { grid } = createGrid(5, ['rose'], 2);
  assert.equal(lowestRow(grid), 1);
  const empty = clearCells(grid, grid.flatMap((row, r) => row.map((_, c) => ({ col: c, row: r }))));
  assert.ok(isEmpty(empty));
  assert.equal(lowestRow(empty), -1);
});

test('补充行是整排且随机状态会推进', () => {
  const first = spawnRow(12345, ['rose', 'mint']);
  assert.equal(first.row.length, COLUMNS);
  assert.notEqual(first.randomState, 12345);
  const again = spawnRow(12345, ['rose', 'mint']);
  assert.deepEqual(again.row, first.row, '同一状态出同一行');
});

test('按颜色统计用来给 HUD 和机器人挑色', () => {
  const grid = blank();
  grid[0][0] = marble('rose');
  grid[0][1] = marble('rose');
  grid[0][2] = marble('mint');
  const counts = colorCounts(grid);
  assert.equal(counts.get('rose'), 2);
  assert.equal(counts.get('mint'), 1);
});
