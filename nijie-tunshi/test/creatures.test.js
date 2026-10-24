import test from 'node:test';
import assert from 'node:assert/strict';
import { creatureMotion, CREATURE_BEHAVIOR } from '../src/game/creatures.js';
import { createGame } from '../src/game/simulation.js';

const encounter = { coreUnlocked: false };

test('small candy creatures flee deterministically when edible', () => {
  const player = { x: 0, z: 0, mass: 10, abilities: { resonance: 100 } };
  const candy = { x: 3, z: 0, mass: 2, size: 0.8, type: 'orb', active: true, polarity: 'neutral' };
  const first = creatureMotion(candy, player, encounter, 1 / 60);
  const second = creatureMotion(candy, player, encounter, 1 / 60);
  assert.ok(first.x > 0);
  assert.equal(first.z, 0);
  assert.deepEqual(first, second);
});

test('much larger candy creatures approach without becoming enemies', () => {
  const player = { x: 0, z: 0, mass: 4, abilities: { resonance: 100 } };
  const candy = { x: 0, z: 8, mass: 12, size: 1.4, type: 'cube', active: true, polarity: 'neutral' };
  const motion = creatureMotion(candy, player, encounter, 1 / 60);
  assert.ok(motion.z < 0);
  assert.ok(Math.abs(motion.z) < CREATURE_BEHAVIOR.approachSpeed / 60);
});

test('cores and gravity shards never move on their own', () => {
  const state = createGame();
  const player = { x: 10, z: -10, mass: 100, abilities: { resonance: 100 } };
  const core = state.objects.find((object) => object.id === 'core');
  const shard = state.objects.find((object) => object.id === 'shard-a');
  assert.deepEqual(creatureMotion(core, player, { coreUnlocked: true }, 1), { x: 0, z: 0 });
  assert.deepEqual(creatureMotion(shard, player, encounter, 1), { x: 0, z: 0 });
});
