import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, USED, bumpResult, isBumpable, isGoal, isHazard, isSolid, parseLevel, setTile, tileAt } from '../src/game/tiles.js';

test('地面、砖块和机关块都是固实的，金币和尖刺不是', () => {
  assert.ok(isSolid('#'));
  assert.ok(isSolid('B'));
  assert.ok(isSolid('?'));
  assert.ok(isSolid('U'), '顶过的块仍然挡路');
  assert.equal(isSolid('o'), false);
  assert.equal(isSolid('x'), false);
  assert.equal(isSolid(' '), false);
});

test('顶问号块出蘑菇并变成用过的块，砖块直接顶碎', () => {
  assert.deepEqual(bumpResult('?'), { tile: USED, item: 'mushroom' });
  assert.deepEqual(bumpResult('!'), { tile: USED, item: 'star' });
  assert.deepEqual(bumpResult('C'), { tile: USED, item: 'coin' });
  assert.deepEqual(bumpResult('B'), { tile: EMPTY, item: null });
  assert.deepEqual(bumpResult('='), { tile: '=', item: null }, '石块顶不动');
  assert.equal(isBumpable('='), false);
  assert.ok(isHazard('x'));
  assert.ok(isGoal('G'));
});

test('越界读取当成空气，不会抛错', () => {
  const grid = [[...'##']];
  assert.equal(tileAt(grid, 0, 0), '#');
  assert.equal(tileAt(grid, -1, 0), EMPTY);
  assert.equal(tileAt(grid, 5, 0), EMPTY);
  assert.equal(tileAt(grid, 0, 9), EMPTY);
});

test('setTile 只复制被改的那一行，原网格不受影响', () => {
  const grid = [[...'BB'], [...'##']];
  const next = setTile(grid, 0, 0, EMPTY);
  assert.equal(next[0][0], EMPTY);
  assert.equal(grid[0][0], 'B', '原网格保持不变');
  assert.equal(next[1], grid[1], '未改动的行继续共享引用');
  assert.equal(setTile(grid, 9, 0, EMPTY), grid, '越界写入原样返回');
});

test('解析关卡：出生点和敌人字符被抹掉，金币被统计', () => {
  const parsed = parseLevel([
    '  o  ',
    ' @ g ',
    '#####',
  ]);
  assert.equal(parsed.width, 5);
  assert.equal(parsed.height, 3);
  assert.deepEqual(parsed.spawn, { x: 1, y: 1 });
  assert.equal(parsed.coins, 1);
  assert.deepEqual(parsed.enemies, [{ kind: 'walker', x: 3, y: 1 }]);
  assert.equal(parsed.grid[1][1], EMPTY, '出生点不留下瓦片');
  assert.equal(parsed.grid[1][3], EMPTY, '敌人不留下瓦片');
});

test('短行补齐成统一宽度', () => {
  const parsed = parseLevel(['#', '####']);
  assert.equal(parsed.grid[0].length, 4);
  assert.equal(parsed.grid[0][3], EMPTY);
});
