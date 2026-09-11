import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLY_SPAWNS,
  ENEMY_SPAWNS,
  MAP_ROWS,
  canSee,
  castRay,
  circleBlocked,
  createArena,
  isWall,
  resolveMove,
  safestSpawn,
} from '../src/game/arena.js';
import { UNIT_RADIUS } from '../src/game/rules.js';

const arena = createArena();

test('地图每行等宽且四周封边', () => {
  const width = MAP_ROWS[0].length;
  for (const row of MAP_ROWS) {
    assert.equal(row.length, width, `这一行宽度不对：${row}`);
    assert.equal(row[0], '#');
    assert.equal(row[row.length - 1], '#');
  }
  assert.ok(MAP_ROWS[0].split('').every((ch) => ch === '#'));
  assert.ok(MAP_ROWS.at(-1).split('').every((ch) => ch === '#'));
});

test('出生点都落在空地上，且左右各三个', () => {
  assert.equal(ALLY_SPAWNS.length, 3);
  assert.equal(ENEMY_SPAWNS.length, 3);
  for (const spawn of [...ALLY_SPAWNS, ...ENEMY_SPAWNS]) {
    assert.equal(isWall(arena, spawn.x, spawn.y), false, `出生点在墙里：${JSON.stringify(spawn)}`);
    assert.equal(circleBlocked(arena, spawn.x, spawn.y), false, '出生点站不下人');
  }
});

test('圆形碰撞按半径判定，贴墙就算撞上', () => {
  assert.equal(isWall(arena, 4.5, 3.5), true, '第 3 行的掩体');
  assert.equal(circleBlocked(arena, 4 - UNIT_RADIUS - 0.05, 3.5), false, '差一点点还没贴上');
  assert.equal(circleBlocked(arena, 4 - UNIT_RADIUS + 0.1, 3.5), true, '半径压进墙里');
});

test('分轴推进让人贴着掩体滑走而不是卡住', () => {
  const start = { x: 4 - UNIT_RADIUS - 0.02, y: 3.5 };
  const moved = resolveMove(arena, start.x, start.y, 0.3, 0.3);
  assert.equal(moved.x, start.x, '横向被墙挡住');
  assert.ok(moved.y > start.y, '纵向照样走');
});

test('射线打到墙就停，空走廊一路到底', () => {
  const blocked = castRay(arena, 1.5, 3.5, 1, 0, 16);
  assert.equal(blocked.hit, true);
  assert.ok(blocked.distance < 3, `应该在第一块掩体前停下，实际 ${blocked.distance}`);
  const open = castRay(arena, 1.5, 1.5, 1, 0, 16);
  assert.equal(open.hit, false, '第 1 行是通透长廊');
});

test('视线被掩体挡住，长廊里互相看得见', () => {
  assert.equal(canSee(arena, { x: 1.5, y: 3.5 }, { x: 10.5, y: 3.5 }), false);
  assert.equal(canSee(arena, { x: 1.5, y: 1.5 }, { x: 17.5, y: 1.5 }), true);
  assert.equal(canSee(arena, { x: 6.5, y: 8.5 }, { x: 6.5, y: 8.5 }), true, '同一点算看得见');
});

test('复活点挑离敌人最远的，不会睁眼就送', () => {
  const enemies = [{ ...ALLY_SPAWNS[0], alive: true }];
  const spot = safestSpawn(arena, ALLY_SPAWNS, enemies);
  assert.notDeepEqual(spot, ALLY_SPAWNS[0], '敌人就站在第一个点上');
  const far = safestSpawn(arena, ALLY_SPAWNS, [{ ...ALLY_SPAWNS[1], alive: false }]);
  assert.ok(ALLY_SPAWNS.includes(far), '死掉的敌人不参与计算');
});
