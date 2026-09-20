import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, isHazard, isPlatform, isSolid, parseLevel, setTile, tileAt } from '../src/game/tiles.js';

const rows = [
  '        ',
  ' @  p B ',
  '   ---  ',
  ' s j t  ',
  '########',
  '###xx###',
];

test('瓦片谓词：钢架不是实心，水不是实心', () => {
  assert.ok(isSolid('#'));
  assert.ok(isSolid('='));
  assert.ok(isSolid('o'));
  assert.ok(!isSolid('-'));
  assert.ok(isPlatform('-'));
  assert.ok(!isSolid('x'));
  assert.ok(isHazard('x'));
});

test('解析关卡：出生点、兵力、补给箱和 Boss 都被抠出来，网格里不再留标记', () => {
  const parsed = parseLevel(rows);
  assert.deepEqual(parsed.spawn, { x: 1, y: 1 });
  assert.deepEqual(parsed.boss, { x: 6, y: 1 });
  assert.equal(parsed.pods.length, 1);
  assert.deepEqual(parsed.pods[0], { x: 4, y: 1 });
  assert.deepEqual(
    parsed.enemies.map((enemy) => enemy.kind),
    ['soldier', 'jumper', 'turret'],
  );
  for (const line of parsed.grid) {
    for (const tile of line) {
      assert.ok(!'@pBsjt'.includes(tile), `网格里不该留下布点标记：${tile}`);
    }
  }
  assert.equal(parsed.width, 8);
  assert.equal(parsed.height, rows.length);
});

test('越界读瓦片当成空气，写瓦片只复制被改的那一行', () => {
  const parsed = parseLevel(rows);
  assert.equal(tileAt(parsed.grid, -1, 0), EMPTY);
  assert.equal(tileAt(parsed.grid, 0, 99), EMPTY);
  const next = setTile(parsed.grid, 0, 4, EMPTY);
  assert.notEqual(next, parsed.grid);
  assert.equal(next[4][0], EMPTY);
  assert.equal(parsed.grid[4][0], '#', '原网格不该被改动');
  assert.equal(next[5], parsed.grid[5], '没改到的行继续共享');
});
