import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientOffset, burstDirection, PARTICLE_PROFILES, profileFor, seedFor } from '../src/game/effects.js';

test('every supported object type has a distinct particle profile', () => {
  const profiles = ['orb', 'cylinder', 'cube', 'prism', 'crystal', 'core'].map((type) => profileFor(type));
  const signatures = new Set(profiles.map((profile) => JSON.stringify(profile)));
  assert.equal(signatures.size, profiles.length);
});

test('particle directions are deterministic for the same object seed', () => {
  const seed = seedFor('orb-1');
  assert.deepEqual(burstDirection('orb', 3, 22, seed), burstDirection('orb', 3, 22, seed));
  assert.deepEqual(ambientOffset('crystal', 5, seed, 2.5, 1.2), ambientOffset('crystal', 5, seed, 2.5, 1.2));
});

test('each object type emits a recognizable directional pattern', () => {
  const seed = seedFor('test');
  const cylinder = burstDirection('cylinder', 0, 28, seed);
  const cube = burstDirection('cube', 0, 30, seed);
  const prism = burstDirection('prism', 0, 34, seed);
  assert.ok(cylinder[1] > 0);
  assert.ok(Math.hypot(cylinder[0], cylinder[2]) > 0.75);
  assert.ok(Math.abs(cube[0]) > Math.abs(cube[1]));
  assert.ok(Math.hypot(prism[0], prism[2]) > 0.85);
});

test('ambient offsets stay within the configured radius envelope', () => {
  for (const type of Object.keys(PARTICLE_PROFILES)) {
    const seed = seedFor(type);
    for (let index = 0; index < 12; index += 1) {
      const [x, y, z] = ambientOffset(type, index, seed, 3.4, 1.5);
      assert.ok(Math.abs(x) <= 1.6, `${type} x`);
      assert.ok(Math.abs(y) <= 1.35, `${type} y`);
      assert.ok(Math.abs(z) <= 1.6, `${type} z`);
    }
  }
});

test('unknown types fall back to the orb profile', () => {
  assert.equal(profileFor('unknown'), PARTICLE_PROFILES.orb);
});
