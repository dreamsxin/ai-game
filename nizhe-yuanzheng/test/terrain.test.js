import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, WINCH_RANGE, materialIndexOf } from '../src/game/rules.js';
import {
  CELL,
  CELLS,
  addRut,
  cellIndexAt,
  createTerrain,
  groundAt,
  heightAt,
  nearestOnRoute,
  normalAt,
  routeLength,
  sinkCapacity,
} from '../src/game/terrain.js';
import { LEVELS, buildLevel, nearbyProps, remainingDistance } from '../src/game/level.js';

const plan = LEVELS[0].plan;
const terrain = createTerrain(1234, plan);

test('高度场尺寸和格子数对得上', () => {
  assert.equal(terrain.height.length, (CELLS + 1) * (CELLS + 1));
  assert.equal(terrain.material.length, CELLS * CELLS);
  assert.equal(terrain.size, CELL * CELLS);
});

test('同一个 seed 生成完全相同的地形', () => {
  const again = createTerrain(1234, plan);
  assert.deepEqual(Array.from(again.height), Array.from(terrain.height));
  assert.deepEqual(Array.from(again.material), Array.from(terrain.material));
});

test('换 seed 会换地形', () => {
  const other = createTerrain(5678, plan);
  assert.notDeepEqual(Array.from(other.height), Array.from(terrain.height));
});

test('路面被压平：路线上的高度就是路线自己的高程', () => {
  for (const point of terrain.route) {
    const sampled = heightAt(terrain, point.x, point.z);
    assert.ok(Math.abs(sampled - point.y) < 0.6, `路面高度差 ${(sampled - point.y).toFixed(2)} 米，车会撞台阶`);
  }
});

test('路线相邻两点的坡度是可开的', () => {
  for (let index = 0; index + 1 < terrain.route.length; index += 1) {
    const a = terrain.route[index];
    const b = terrain.route[index + 1];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    const grade = Math.abs(b.y - a.y) / run;
    assert.ok(grade < 0.42, `第 ${index} 段坡度 ${(grade * 100).toFixed(0)}%，重载卡车上不去`);
  }
});

test('路面材质就是路线声明的材质', () => {
  const middle = terrain.route[3];
  assert.equal(terrain.material[cellIndexAt(terrain, middle.x, middle.z)], middle.material);
});

test('越界采样夹在边界上，不返回 undefined', () => {
  for (const [x, z] of [[-9999, 0], [9999, 0], [0, -9999], [0, 9999]]) {
    const ground = groundAt(terrain, x, z);
    assert.ok(Number.isFinite(ground.y));
    assert.ok(ground.material);
  }
});

test('法线是单位向量而且朝上', () => {
  for (const [x, z] of [[0, 0], [-80, 40], [120, -100]]) {
    const normal = normalAt(terrain, x, z);
    assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-6);
    assert.ok(normal.y > 0.3);
  }
});

test('折线最近点：距离、弧长、插值高度都对', () => {
  const route = [
    { x: 0, z: 0, y: 0, material: 2, width: 6 },
    { x: 100, z: 0, y: 10, material: 2, width: 6 },
  ];
  assert.equal(routeLength(route), 100);
  const near = nearestOnRoute(route, 50, 8);
  assert.equal(near.distance, 8);
  assert.equal(near.along, 50);
  assert.equal(near.y, 5);
  // 线段之外的点会被夹到端点上。
  assert.equal(nearestOnRoute(route, -30, 0).along, 0);
  assert.equal(nearestOnRoute(route, 300, 0).along, 100);
});

test('车辙只增不减，且封顶在材质允许的深度', () => {
  const fresh = createTerrain(99, plan);
  const mud = materialIndexOf('mud');
  fresh.material.fill(mud);
  const index = cellIndexAt(fresh, 0, 0);
  const base = sinkCapacity(fresh, index);
  let total = 0;
  for (let pass = 0; pass < 400; pass += 1) total += addRut(fresh, index, 0.02);
  assert.ok(total > 0);
  // ruts 是 Float32Array，比较得留精度余量。
  assert.ok(Math.abs(fresh.ruts[index] - MATERIALS[mud].ruts) < 1e-6);
  assert.ok(sinkCapacity(fresh, index) > base, '压出车辙之后应该能陷得更深');
  assert.equal(addRut(fresh, index, 0.5), 0, '到顶之后不该再变深');
});

test('硬岩压不出车辙', () => {
  const rock = createTerrain(7, plan);
  rock.material.fill(materialIndexOf('rock'));
  const index = cellIndexAt(rock, 10, 10);
  assert.equal(addRut(rock, index, 1), 0);
  assert.equal(sinkCapacity(rock, index), 0);
});

test('每一关都有货场、交付点和能挂绞盘的锚点', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    const level = buildLevel(index, 2026 + index);
    assert.ok(level.length > 300, `${level.name} 路线只有 ${level.length.toFixed(0)} 米，太短了`);
    assert.ok(Math.hypot(level.depot.x - level.site.x, level.depot.z - level.site.z) > 200);
    const anchors = level.props.filter((prop) => prop.anchor);
    assert.ok(anchors.length > 40, `${level.name} 只有 ${anchors.length} 个锚点，陷车就没救了`);
    assert.ok(level.cargo.count >= 1);
    // 起点附近必须有锚点，否则第一次陷车就无解。
    assert.ok(nearbyProps(level, level.depot.x, level.depot.z).length > 0);
  }
});

test('泥泞路段全程都有绞盘够得着的锚点', () => {
  const soft = new Set([materialIndexOf('mud'), materialIndexOf('swamp'), materialIndexOf('water')]);
  for (let index = 0; index < LEVELS.length; index += 1) {
    const level = buildLevel(index, 900 + index);
    const anchors = level.props.filter((prop) => prop.anchor);
    for (let seg = 0; seg + 1 < level.route.length; seg += 1) {
      const a = level.route[seg];
      const b = level.route[seg + 1];
      if (!soft.has(a.material) && !soft.has(b.material)) continue;
      const steps = 8;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const nearest = Math.min(...anchors.map((prop) => Math.hypot(prop.x - x, prop.z - z)));
        assert.ok(nearest <= WINCH_RANGE, `${level.name} 泥泞段有一处最近锚点 ${nearest.toFixed(1)} 米，陷在那里就是死局`);
      }
    }
  }
});

test('剩余里程从满程递减到零', () => {
  const level = buildLevel(0, 4321);
  const start = remainingDistance(level, level.depot.x, level.depot.z);
  const middle = remainingDistance(level, level.route[4].x, level.route[4].z);
  const end = remainingDistance(level, level.site.x, level.site.z);
  assert.ok(start > middle && middle > end);
  assert.ok(end < 1);
});
