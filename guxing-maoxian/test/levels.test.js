import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_ROWS } from '../src/game/levels.js';
import { isSolid, parseLevel } from '../src/game/tiles.js';

test('三关都是 14 行、等宽、并且有出生点和终点旗杆', () => {
  assert.equal(LEVELS.length, 3);
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    assert.equal(parsed.height, LEVEL_ROWS, `${level.key} 行数`);
    for (const row of parsed.grid) assert.equal(row.length, parsed.width, `${level.key} 每行等宽`);
    assert.ok(parsed.width >= 100, `${level.key} 至少 100 格长`);
    assert.equal(parsed.spawn.y, 11, `${level.key} 出生点站在地面上`);
    assert.ok(parsed.grid.some((row) => row.includes('G')), `${level.key} 有终点旗杆`);
  }
});

test('出生点脚下有地面，出生位置不会被挡住', () => {
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    const { x, y } = parsed.spawn;
    assert.ok(isSolid(parsed.grid[y + 1][x]), `${level.key} 出生点下方是地面`);
    assert.equal(isSolid(parsed.grid[y][x]), false, `${level.key} 出生点本身是空的`);
  }
});

test('每关都有敌人、金币、可顶的机关块和限时', () => {
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    assert.ok(parsed.enemies.length >= 5, `${level.key} 敌人数量`);
    assert.ok(parsed.coins > 0, `${level.key} 有金币`);
    assert.ok(parsed.grid.some((row) => row.includes('?')), `${level.key} 有问号块`);
    assert.ok(parsed.grid.some((row) => row.includes('!')), `${level.key} 有星星块`);
    assert.ok(level.time >= 240, `${level.key} 限时`);
  }
});

test('关卡越往后越长，难度递进', () => {
  const widths = LEVELS.map((level) => parseLevel(level.rows).width);
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b));
});

test('终点旗杆前后没有坑，站得住', () => {
  for (const level of LEVELS) {
    const parsed = parseLevel(level.rows);
    const goalCol = parsed.grid[8].findIndex((tile) => tile === 'G');
    assert.ok(goalCol > 0, `${level.key} 旗杆在第 8 行有一段`);
    assert.ok(isSolid(parsed.grid[12][goalCol]), `${level.key} 旗杆脚下是地面`);
  }
});
