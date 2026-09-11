import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, GRID_ROWS } from '../src/game/rules.js';
import { bomb, brick, plus } from '../src/game/bricks.js';
import {
  at,
  clearCells,
  countCells,
  createGrid,
  descend,
  destroy,
  hitCell,
  isEmpty,
  lowestRow,
  setCell,
  spawnRow,
  totalHp,
} from '../src/game/grid.js';

const blank = () => Array.from({ length: GRID_ROWS }, () => Array.from({ length: COLUMNS }, () => null));

test('新行至少留一个空位，弹珠才钻得上去', () => {
  for (let seed = 1; seed < 40; seed += 1) {
    const { row } = spawnRow(seed * 7919, 5);
    assert.ok(row.filter(Boolean).length >= 3, '也不能太空');
    assert.ok(row.some((cell) => cell === null), `seed ${seed} 生成了满行`);
  }
});

test('同一随机状态生成同一行', () => {
  const a = spawnRow(4242, 3);
  const b = spawnRow(4242, 3);
  assert.deepEqual(a.row, b.row);
  assert.equal(a.randomState, b.randomState);
  assert.notEqual(a.randomState, 4242, '随机状态要往前走');
});

test('开局铺好几行且都堆在顶部', () => {
  const { grid } = createGrid(99, 3);
  assert.ok(countCells(grid) > 0);
  assert.equal(lowestRow(grid), 2, '三行就压到第 2 行');
  assert.ok(grid.slice(3).every((row) => row.every((cell) => cell === null)));
});

test('整墙下压：新行进顶部，底行还有砖就是越线', () => {
  const grid = blank();
  grid[0][1] = brick(3);
  const fresh = Array.from({ length: COLUMNS }, () => brick(1));
  const pushed = descend(grid, fresh);
  assert.equal(pushed.overflow, 0);
  assert.equal(pushed.grid[1][1].hp, 3, '原来的第 0 行被推到第 1 行');
  const packed = blank();
  packed[GRID_ROWS - 1][2] = brick(1);
  assert.equal(descend(packed, fresh).overflow, 1);
});

test('普通砖先掉血，血空了才拆', () => {
  const grid = setCell(blank(), 2, 3, brick(2));
  const first = hitCell(grid, 2, 3);
  assert.equal(first.pass, false, '砖块会挡路');
  assert.equal(at(first.grid, 2, 3).hp, 1);
  assert.deepEqual(first.broken, []);
  const second = hitCell(first.grid, 2, 3);
  assert.equal(at(second.grid, 2, 3), null);
  assert.equal(second.broken.length, 1);
  assert.equal(second.broken[0].kind, 'brick');
});

test('加珠碰到就吃掉，而且不挡路', () => {
  const grid = setCell(blank(), 4, 2, plus());
  const result = hitCell(grid, 4, 2);
  assert.equal(result.pickup, true);
  assert.equal(result.pass, true, '弹珠直接穿过去');
  assert.equal(at(result.grid, 4, 2), null);
});

test('打空格不会有任何后果', () => {
  const grid = blank();
  const result = hitCell(grid, 0, 0);
  assert.equal(result.pass, true);
  assert.equal(result.grid, grid);
});

test('炸弹砖碎了带走周围一圈，圈里有炸弹就连锁', () => {
  let grid = blank();
  grid = setCell(grid, 3, 4, bomb(1));
  grid = setCell(grid, 2, 4, brick(9));
  grid = setCell(grid, 4, 5, brick(9));
  grid = setCell(grid, 4, 3, bomb(9));
  grid = setCell(grid, 5, 2, brick(9));
  const result = hitCell(grid, 3, 4);
  assert.equal(result.broken.length, 5, '两颗炸弹连锁把这一片全带走');
  assert.ok(isEmpty(result.grid));
  assert.ok(result.broken.some((cell) => cell.kind === 'bomb'));
});

test('炸弹连爆时血再厚的砖也直接没了', () => {
  let grid = blank();
  grid = setCell(grid, 1, 1, bomb(1));
  grid = setCell(grid, 0, 0, brick(999));
  const result = hitCell(grid, 1, 1);
  assert.equal(at(result.grid, 0, 0), null);
});

test('炸弹圈里的加珠也算吃到', () => {
  let grid = blank();
  grid = setCell(grid, 3, 3, bomb(1));
  grid = setCell(grid, 3, 4, plus());
  const result = hitCell(grid, 3, 3);
  assert.ok(result.broken.some((cell) => cell.kind === 'plus'));
});

test('直接拆一组格子也走同一套连锁逻辑', () => {
  let grid = blank();
  grid = setCell(grid, 0, 0, brick(1));
  grid = setCell(grid, 6, 9, brick(1));
  const result = destroy(grid, [{ col: 0, row: 0 }, { col: 6, row: 9 }]);
  assert.equal(result.broken.length, 2);
  assert.ok(isEmpty(result.grid));
});

test('总血量不算加珠，清空后归零', () => {
  let grid = blank();
  grid = setCell(grid, 0, 0, brick(4));
  grid = setCell(grid, 1, 0, plus());
  assert.equal(totalHp(grid), 4);
  assert.equal(totalHp(clearCells(grid, [{ col: 0, row: 0 }])), 0);
  assert.equal(lowestRow(blank()), -1);
});
