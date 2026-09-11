import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/game/tiles.js';
import { isGrounded, moveBody, overlap, solidAt, walkStep } from '../src/game/physics.js';

const gridOf = (rows) => parseLevel(rows).grid;

const FLAT = gridOf([
  '          ',
  '          ',
  '          ',
  '##########',
]);

const box = (x, y, vx = 0, vy = 0) => ({ x, y, w: 0.72, h: 0.86, vx, vy, dir: vx >= 0 ? 1 : -1 });

test('AABB 相交判定按开区间算，贴边不算重叠', () => {
  assert.ok(overlap(box(1, 1), box(1.5, 1.5)));
  assert.equal(overlap(box(1, 1), box(1.72, 1)), false, '右边缘正好贴上不算碰');
});

test('向右撞墙时贴着墙面停下并清零速度', () => {
  const grid = gridOf([
    '   #',
    '   #',
    '####',
  ]);
  const moved = moveBody(grid, box(2.2, 1.14, 10, 0), 1 / 60);
  assert.ok(moved.hit.right);
  assert.equal(moved.body.vx, 0);
  assert.equal(moved.body.x + moved.body.w, 3, '身体右边缘正好贴在第 3 列');
});

test('下落到地面时 hit.down 为真且脚正好落在地表', () => {
  const moved = moveBody(FLAT, box(1, 2, 0, 20), 1 / 60);
  assert.ok(moved.hit.down);
  assert.equal(moved.body.y + moved.body.h, 3);
  assert.equal(moved.body.vy, 0);
});

test('顶到头顶只报告离身体中心最近的那一格', () => {
  const grid = gridOf([
    'BB  ',
    '    ',
    '####',
  ]);
  const moved = moveBody(grid, box(1.1, 1.05, 0, -8), 1 / 60);
  assert.ok(moved.hit.up);
  assert.deepEqual(moved.bumped, { col: 1, row: 0 }, '身体中心偏向第 1 列');
});

test('站在地面上算 grounded，悬空不算', () => {
  assert.ok(isGrounded(FLAT, box(1, 3 - 0.86)));
  assert.equal(isGrounded(FLAT, box(1, 1)), false);
  assert.ok(solidAt(FLAT, 0, 3));
  assert.equal(solidAt(FLAT, 0, 2), false);
});

test('撞墙的敌人转身继续走', () => {
  const grid = gridOf([
    '#   ',
    '#   ',
    '####',
  ]);
  const walker = { ...box(1, 2.2, -3, 0), dir: -1 };
  const stepped = walkStep(grid, walker, 1 / 60);
  assert.equal(stepped.body.dir, 1, '左边是墙，转向右');
});

test('会看悬崖的敌人走到边缘就转身', () => {
  const grid = gridOf([
    '     ',
    '     ',
    '###  ',
  ]);
  const walker = { ...box(2.2, 2 - 0.86, 3, 6), dir: 1 };
  const stepped = walkStep(grid, walker, 1 / 60, { turnAtLedge: true });
  assert.ok(stepped.hit.down, '这一步应该踩到地面');
  assert.equal(stepped.body.dir, -1, '前方没有地面，转身');
});
