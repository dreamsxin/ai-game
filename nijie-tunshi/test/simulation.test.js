import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, abilityUnlocked } from '../src/game/abilities.js';
import { LEVEL } from '../src/game/level.js';
import { createGame, radiusForMass, step, togglePause } from '../src/game/simulation.js';
import { createReplayAgent } from './helpers/replayAgent.js';

const advance = (state, input, seconds) => {
  let next = state;
  for (let index = 0; index < Math.ceil(seconds * 60); index += 1) next = step(next, input, 1 / 60);
  return next;
};

test('game begins immediately and remains deterministic', () => {
  let left = createGame(77);
  let right = createGame(77);
  assert.equal(left.status, 'playing');
  for (let index = 0; index < 120; index += 1) {
    const input = { x: index % 3 === 0 ? 1 : 0, z: index % 5 === 0 ? -1 : 0 };
    left = step(left, input);
    right = step(right, input);
  }
  assert.deepEqual(left, right);
});

test('dash spends resonance, locks direction, and cools down', () => {
  let state = createGame();
  state = step(state, { x: 1, dashPressed: true });
  assert.ok(state.player.abilities.dash.activeFor > 0);
  assert.equal(state.player.abilities.dash.direction.x, 1);
  assert.ok(state.player.abilities.resonance < 100);
  const spent = state.player.abilities.resonance;
  state = step(state, { x: -1, dashPressed: true });
  assert.equal(state.player.abilities.dash.direction.x, 1);
  assert.ok(state.player.abilities.resonance >= spent);
  state = advance(state, {}, ABILITIES.dash.cooldown + 0.2);
  assert.equal(state.player.abilities.dash.cooldown, 0);
});

test('dash breaks a crystal panel but regular rolling does not', () => {
  let regular = createGame();
  regular.player.x = -17;
  regular.player.z = 13;
  regular = advance(regular, { x: 1 }, 0.5);
  assert.equal(regular.structures.find((item) => item.id === 'crystal-panel').active, true);

  let dashed = createGame();
  dashed.player.x = -17;
  dashed.player.z = 13;
  dashed = advance(dashed, { x: 1, dashPressed: true }, 0.2);
  assert.equal(dashed.structures.find((item) => item.id === 'crystal-panel').active, false);
  assert.ok(dashed.actionEvents.some((event) => event.type === 'structureBreak'));
});

test('gravity requires mass 12 and attracts eligible shards', () => {
  assert.equal(abilityUnlocked('gravity', 11.9), false);
  assert.equal(abilityUnlocked('gravity', 12), true);
  let state = createGame();
  state.player.mass = 12;
  state.player.radius = radiusForMass(12);
  state.player.x = -5;
  state.player.z = 13;
  const before = state.objects.find((object) => object.id === 'shard-a').z;
  state = advance(state, { gravityHeld: true }, 0.5);
  assert.notEqual(state.objects.find((object) => object.id === 'shard-a').z, before);
  assert.ok(state.player.abilities.resonance < 100);
});

test('phase gate blocks normally and records the phase shortcut', () => {
  let state = createGame();
  state.player.mass = 32;
  state.player.radius = radiusForMass(32);
  state.player.x = 4;
  state.player.z = -1;
  state = advance(state, { z: -1 }, 0.5);
  assert.ok(state.player.z > -2.3);

  state.player.z = -1;
  state.player.vz = 0;
  state = advance(state, { z: -1, phasePressed: true }, 0.5);
  assert.ok(state.player.z < -4.5);
  assert.equal(state.encounter.phaseShortcut, true);
});

test('core remains protected until both anchors are broken', () => {
  let state = createGame();
  state.player.mass = 90;
  state.player.radius = radiusForMass(90);
  const core = state.objects.find((object) => object.id === 'core');
  state.player.x = core.x;
  state.player.z = core.z;
  state = step(state, {});
  assert.equal(state.objects.find((object) => object.id === 'core').active, true);

  state.encounter.anchors.north = 0;
  state.encounter.anchors.south = 0;
  state.encounter.coreUnlocked = true;
  state = step(state, {});
  assert.equal(state.objects.find((object) => object.id === 'core').active, false);
});

test('combo persists across steps and expires', () => {
  let state = createGame();
  state.player.x = LEVEL.objects[0].x;
  state.player.z = LEVEL.objects[0].z;
  state = step(state, {});
  assert.equal(state.player.combo, 1);
  state.player.x = LEVEL.objects[1].x;
  state.player.z = LEVEL.objects[1].z;
  state = step(state, {});
  assert.equal(state.player.combo, 2);
  state = advance(state, {}, 3);
  assert.equal(state.player.combo, 0);
  assert.equal(state.player.highestCombo, 2);
});

test('scripted replay breaks both anchors, consumes the core, and reaches ascension', () => {
  let state = createGame();
  const agent = createReplayAgent();
  for (let index = 0; index < 40000 && state.status === 'playing'; index += 1) {
    state = step(state, agent.snapshot(state), 1 / 60);
  }
  assert.equal(state.status, 'ascending');
  assert.equal(state.encounter.coreUnlocked, true);
  assert.deepEqual(state.encounter.anchors, { north: 0, south: 0 });
  assert.equal(state.objects.find((object) => object.id === 'core').active, false);
  assert.ok(state.encounter.brokenStructures.includes('crystal-panel'));
});

test('pause freezes simulation and toggle resumes it', () => {
  let state = createGame();
  state = togglePause(state);
  const paused = step(state, { x: 1 }, 1);
  assert.deepEqual(paused, state);
  state = togglePause(state);
  assert.equal(state.status, 'playing');
});
