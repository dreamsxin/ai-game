import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/game/level.js';
import {
  cellToWorld, createNavGrid, findPath, isBlocked, nearestOpenCell, simplifyPath, worldToCell,
} from '../src/game/navigation.js';

const grid = createNavGrid(1.2);

test('walls and the outer margin are marked impassable', () => {
  const wall = LEVEL.obstacles.find((obstacle) => obstacle.id === 'wall-c');
  const inside = worldToCell(grid, wall.x, wall.z);
  assert.equal(isBlocked(grid, inside.col, inside.row), true, '墙心必须不可通行');

  const corner = worldToCell(grid, LEVEL.bounds.minX + 0.1, LEVEL.bounds.minZ + 0.1);
  assert.equal(isBlocked(grid, corner.col, corner.row), true, '边界余量应被封住');

  const spawn = worldToCell(grid, LEVEL.start.x, LEVEL.start.z);
  assert.equal(isBlocked(grid, spawn.col, spawn.row), false, '出生点必须可通行');
});

test('breakable panels and the phase gate do not block navigation', () => {
  for (const structure of LEVEL.structures) {
    const cell = worldToCell(grid, structure.x, structure.z);
    assert.equal(
      isBlocked(grid, cell.col, cell.row),
      false,
      `${structure.id} 由能力处理，不应计入导航障碍`,
    );
  }
});

test('a path from spawn to the exit exists and never crosses a blocked cell', () => {
  const path = findPath(grid, LEVEL.start, LEVEL.exit);
  assert.ok(path && path.length > 1, '出生点到出口必须可达');
  for (const point of path) {
    const cell = worldToCell(grid, point.x, point.z);
    assert.equal(isBlocked(grid, cell.col, cell.row), false, `路径穿过障碍: ${JSON.stringify(point)}`);
  }
  const last = path[path.length - 1];
  assert.ok(Math.hypot(last.x - LEVEL.exit.x, last.z - LEVEL.exit.z) <= 2, '终点应落在出口附近');
});

test('paths are deterministic for the same grid and endpoints', () => {
  const left = findPath(grid, LEVEL.start, LEVEL.exit);
  const right = findPath(grid, LEVEL.start, LEVEL.exit);
  assert.deepEqual(left, right, '同一网格与端点必须给出同一条路径');
});

test('targets buried inside a wall fall back to the nearest open cell', () => {
  const wall = LEVEL.obstacles.find((obstacle) => obstacle.id === 'wall-a');
  const buried = worldToCell(grid, wall.x, wall.z);
  const rescued = nearestOpenCell(grid, buried.col, buried.row);
  assert.ok(rescued, '应能找到就近可通行格');
  assert.equal(isBlocked(grid, rescued.col, rescued.row), false);

  const path = findPath(grid, LEVEL.start, cellToWorld(grid, buried.col, buried.row));
  assert.ok(path && path.length > 1, '目标落在墙内时仍应给出可行路径');
});

test('every level object and anchor is reachable from spawn', () => {
  for (const target of [...LEVEL.objects, ...LEVEL.anchors]) {
    const path = findPath(grid, LEVEL.start, target);
    assert.ok(path && path.length > 0, `${target.id} 不可达`);
  }
});

test('collinear waypoints are collapsed', () => {
  const straight = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }];
  assert.deepEqual(simplifyPath(straight), [{ x: 0, z: 0 }, { x: 3, z: 0 }]);

  const bent = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }];
  assert.equal(simplifyPath(bent).length, 3, '转角点必须保留');
  assert.equal(simplifyPath([{ x: 0, z: 0 }]).length, 1);
});

test('an oversized navigation radius seals the map instead of returning a bogus path', () => {
  const sealed = createNavGrid(40);
  assert.equal(findPath(sealed, LEVEL.start, LEVEL.exit), null, '无解时必须返回 null');
});
