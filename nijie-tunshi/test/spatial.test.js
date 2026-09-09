import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/game/level.js';
import { createSpatialIndex, queryObjects, queryRadius, SPATIAL_CELL_SIZE } from '../src/game/spatial.js';
import { createGame, MAX_PULLS_PER_STEP, radiusForMass, step } from '../src/game/simulation.js';
import { ABILITIES } from '../src/game/abilities.js';

const activeObjects = () => LEVEL.objects.map((object) => ({ ...object, active: true }));

// 最关键的性质：查询宁可多给，绝不能漏。漏判会让对象在邻域边缘忽然吃不到。
test('a radius query never misses an object that is genuinely inside it', () => {
  const objects = activeObjects();
  const index = createSpatialIndex(objects);
  for (const radius of [1, 3, 7.5, 14, 30]) {
    for (const probe of [LEVEL.start, LEVEL.exit, { x: 0, z: 0 }, { x: -25, z: 21 }]) {
      const returned = new Set(queryRadius(index, probe.x, probe.z, radius));
      const truth = objects
        .map((object, slot) => ({ object, slot }))
        .filter(({ object }) => Math.hypot(object.x - probe.x, object.z - probe.z) <= radius)
        .map(({ slot }) => slot);
      for (const slot of truth) {
        assert.ok(
          returned.has(slot),
          `半径 ${radius} 在 (${probe.x},${probe.z}) 漏掉了 ${objects[slot].id}`,
        );
      }
    }
  }
});

test('results are ordered by original index so the simulation stays deterministic', () => {
  const objects = activeObjects();
  const index = createSpatialIndex(objects);
  const slots = queryRadius(index, 0, 0, 40);
  assert.deepEqual(slots, [...slots].sort((left, right) => left - right), '必须按原下标升序');
  assert.deepEqual(slots, queryRadius(createSpatialIndex(activeObjects()), 0, 0, 40), '重建索引结果必须一致');
});

test('inactive objects drop out of the index', () => {
  const objects = activeObjects();
  const target = objects.find((object) => object.id === 'orb-1');
  const before = queryObjects(createSpatialIndex(objects), target.x, target.z, 0.5);
  assert.ok(before.some((object) => object.id === 'orb-1'));

  target.active = false;
  const after = queryObjects(createSpatialIndex(objects), target.x, target.z, 0.5);
  assert.ok(!after.some((object) => object.id === 'orb-1'), '已吞噬的对象不应再被查到');
});

test('an empty corner yields nothing and a huge radius yields everything active', () => {
  const objects = activeObjects();
  const index = createSpatialIndex(objects);
  assert.deepEqual(queryRadius(index, LEVEL.bounds.maxX - 0.5, LEVEL.bounds.maxZ - 0.5, 0.4), []);
  assert.equal(queryRadius(index, 0, 0, 200).length, objects.length);
});

test('the pull neighbourhood is far smaller than the full table', () => {
  const objects = activeObjects();
  const index = createSpatialIndex(objects);
  const nearby = queryRadius(index, LEVEL.start.x, LEVEL.start.z, ABILITIES.gravity.radius);
  assert.ok(
    nearby.length < objects.length / 2,
    `邻域应显著小于全表，实际 ${nearby.length}/${objects.length}`,
  );
  assert.ok(SPATIAL_CELL_SIZE > 0);
});

test('the per-step pull cap holds even when the player is swarmed', () => {
  let state = createGame();
  state.player.mass = 200;
  state.player.radius = radiusForMass(200);
  state.player.x = 0;
  state.player.z = 0;
  // 环绕玩家塞入远超上限的可牵引糖屑，且都在触及距离之外免于被立刻吞掉
  const swarm = [];
  for (let slot = 0; slot < MAX_PULLS_PER_STEP * 3; slot += 1) {
    const angle = (slot / (MAX_PULLS_PER_STEP * 3)) * Math.PI * 2;
    swarm.push({
      id: `swarm-${slot}`,
      type: 'orb',
      x: Math.cos(angle) * 6.5,
      z: Math.sin(angle) * 6.5,
      size: 0.3,
      mass: 1,
      color: 0xffffff,
      gravity: true,
      polarity: 'neutral',
      polarityCharge: 0,
      vx: 0,
      vz: 0,
      active: true,
    });
  }
  state.objects = [...state.objects, ...swarm];

  state = step(state, { gravityHeld: true }, 1 / 60);
  const moved = state.objects.filter((object) => object.id.startsWith('swarm-') && (object.vx !== 0 || object.vz !== 0));
  assert.ok(moved.length > 0, '应该确实有糖屑被牵引，否则用例没测到东西');
  assert.ok(
    moved.length <= MAX_PULLS_PER_STEP,
    `单帧牵引数不应超过 ${MAX_PULLS_PER_STEP}，实际 ${moved.length}`,
  );
});
