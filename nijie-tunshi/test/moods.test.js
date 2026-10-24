import test from 'node:test';
import assert from 'node:assert/strict';
import { creatureMood, creatureMoodPose } from '../src/game/moods.js';

const encounter = { coreUnlocked: false };
const player = { x: 0, z: 0, mass: 10 };

test('candy creature moods derive from authoritative consumption state', () => {
  const fleeing = { x: 3, z: 0, mass: 2, size: 0.8, type: 'orb', active: true, polarity: 'neutral' };
  const looming = { x: 0, z: 9, mass: 24, size: 1.8, type: 'cube', active: true, polarity: 'neutral' };
  const sour = { x: 4, z: 0, mass: 2, size: 0.8, type: 'prism', active: true, polarity: 'dark' };
  const drawn = { x: 2, z: 2, mass: 1, size: 0.3, type: 'orb', active: true, gravity: true, polarity: 'neutral' };
  const dormant = { x: 3, z: 0, mass: 8, size: 2, type: 'core', active: true };
  assert.equal(creatureMood(fleeing, player, encounter), 'fleeing');
  assert.equal(creatureMood(looming, player, encounter), 'looming');
  assert.equal(creatureMood(sour, player, encounter), 'sour');
  assert.equal(creatureMood(drawn, player, encounter), 'drawn');
  assert.equal(creatureMood(dormant, player, encounter), 'dormant');
});

test('mood poses recoil when fleeing and lean in when looming, deterministically', () => {
  const candy = { x: 4, z: 0, mass: 2, size: 0.8, type: 'orb', active: true, polarity: 'neutral' };
  const giant = { x: 0, z: 9, mass: 24, size: 1.8, type: 'cube', active: true, polarity: 'neutral' };
  const flee = creatureMoodPose(candy, player, encounter, 1.5);
  const fleeRepeat = creatureMoodPose(candy, player, encounter, 1.5);
  const loom = creatureMoodPose(giant, player, encounter, 1.5);
  assert.ok(flee.lean < 0, 'fleeing leans away');
  assert.ok(loom.lean > 0, 'looming leans toward the player');
  assert.ok(loom.glintScale > 1);
  assert.deepEqual(flee, fleeRepeat);
});

test('distant creatures stay calm regardless of mood', () => {
  const candy = { x: 30, z: 0, mass: 2, size: 0.8, type: 'orb', active: true, polarity: 'neutral' };
  const pose = creatureMoodPose(candy, player, encounter, 2);
  assert.equal(pose.lean, 0);
  assert.equal(pose.bob, 0);
  assert.equal(pose.glintScale, 1);
});
