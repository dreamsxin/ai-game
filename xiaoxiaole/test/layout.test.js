import test from 'node:test';
import assert from 'node:assert/strict';
import { boardBox, cellCenter, cellFromPoint, directionOf } from '../src/game/layout.js';

test('棋盘按正方格居中铺开', () => {
  const box = boardBox(400, 500, 8, 8);
  assert.equal(box.cell, 50, '短边决定格子大小');
  assert.equal(box.originX, 0);
  assert.equal(box.originY, 50, '多出来的高度上下各留一半');
});

test('点坐标能换算回格子，越界返回空', () => {
  const box = boardBox(400, 400, 8, 8);
  assert.deepEqual(cellFromPoint(box, 0, 0), { x: 0, y: 0 });
  assert.deepEqual(cellFromPoint(box, 175, 225), { x: 3, y: 4 });
  assert.equal(cellFromPoint(box, -5, 10), null, '棋盘外应返回 null');
  assert.equal(cellFromPoint(box, 10, 401), null);
});

test('格子中心落在格内正中', () => {
  const box = boardBox(400, 400, 8, 8);
  assert.deepEqual(cellCenter(box, 0, 0), { x: 25, y: 25 });
  assert.deepEqual(cellCenter(box, 7, 7), { x: 375, y: 375 });
});

test('拖动方向量化成四邻之一', () => {
  assert.deepEqual(directionOf(30, 4), { dx: 1, dy: 0 });
  assert.deepEqual(directionOf(-30, 4), { dx: -1, dy: 0 });
  assert.deepEqual(directionOf(4, 30), { dx: 0, dy: 1 });
  assert.deepEqual(directionOf(4, -30), { dx: 0, dy: -1 });
  assert.equal(directionOf(0, 0), null);
});
