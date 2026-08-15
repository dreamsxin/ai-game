import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, abilityUnlocked } from '../src/game/abilities.js';
import { LEVEL } from '../src/game/level.js';
import {
  createGame, enterNextUniverse, isAscensionUnlocked, radiusForMass,
  restartCurrentUniverse, step, togglePause,
} from '../src/game/simulation.js';
import { STELLAR_FUEL_TARGET, STELLAR_IGNITION_MASS, stellarIgnitionReady } from '../src/game/rules.js';
import { createReplayAgent } from './helpers/replayAgent.js';

const advance = (state, input, seconds) => {
  let next = state;
  for (let index = 0; index < Math.ceil(seconds * 60); index += 1) next = step(next, input, 1 / 60);
  return next;
};

test('game begins in the first universe and remains deterministic', () => {
  let left = createGame(77);
  let right = createGame(77);
  assert.equal(left.status, 'playing');
  assert.equal(left.universe.index, 1);
  assert.equal(left.universe.id, 'genesis');
  for (let index = 0; index < 120; index += 1) {
    const input = { x: index % 3 === 0 ? 1 : 0, z: index % 5 === 0 ? -1 : 0 };
    left = step(left, input);
    right = step(right, input);
  }
  assert.deepEqual(left, right);
});

test('restarting preserves the universe while resetting the run', () => {
  const state = createGame(77, { index: 2, cumulativeStars: 3, bestCombo: 6, completedRuns: 1 });
  state.player.mass = 42;
  state.player.fuel = 30;
  state.objects[0].active = false;
  const restarted = restartCurrentUniverse(state);
  assert.equal(restarted.universe.index, 2);
  assert.equal(restarted.universe.cumulativeStars, 3);
  assert.equal(restarted.player.mass, 0);
  assert.equal(restarted.player.fuel, 0);
  assert.equal(restarted.objects[0].active, true);
  assert.deepEqual(restarted.encounter.anchors, { north: 2, south: 2, phase: 1 });
});

test('winning advances to the next universe and preserves meta progress', () => {
  const state = createGame(77);
  state.status = 'won';
  state.result = { stars: 2, highestCombo: 7 };
  const next = enterNextUniverse(state);
  assert.equal(next.status, 'playing');
  assert.equal(next.universe.index, 2);
  assert.equal(next.universe.id, 'antimatter');
  assert.equal(next.universe.cumulativeStars, 2);
  assert.equal(next.universe.bestCombo, 7);
  assert.equal(next.universe.completedRuns, 1);
  assert.ok(next.universe.discoveredRules.includes('极性质量'));
  assert.equal(next.player.mass, 0);
  assert.equal(next.player.fuel, 0);
  assert.ok(next.objects[0].mass > state.objects[0].mass);
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

test('stellar ignition requires mass, fuel, stability, three anchors, phase, and core', () => {
  const state = createGame();
  state.player.mass = STELLAR_IGNITION_MASS;
  state.player.fuel = STELLAR_FUEL_TARGET;
  state.player.stability = 100;
  assert.equal(stellarIgnitionReady(state), false);
  state.encounter.anchors = { north: 0, south: 0, phase: 0 };
  state.encounter.phaseIgnited = true;
  state.objects.find((object) => object.id === 'core').active = false;
  assert.equal(stellarIgnitionReady(state), true);
  assert.equal(isAscensionUnlocked(state), false);
  state.player.ignited = true;
  assert.equal(isAscensionUnlocked(state), true);
});

test('phase anchor only breaks while phase is active', () => {
  let state = createGame();
  state.player.mass = 32;
  state.player.radius = radiusForMass(32);
  const anchor = state.anchors.find((item) => item.id === 'phase');
  state.player.x = anchor.x;
  state.player.z = anchor.z;
  state = step(state, {});
  assert.equal(state.anchors.find((item) => item.id === 'phase').active, true);
  state = step(state, { phasePressed: true });
  assert.equal(state.anchors.find((item) => item.id === 'phase').active, false);
  assert.equal(state.encounter.phaseIgnited, true);
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

test('scripted replay completes stellar ignition and reaches the universe rift', () => {
  let state = createGame();
  const agent = createReplayAgent();
  agent.start();
  for (let index = 0; index < 40000 && state.status === 'playing'; index += 1) {
    state = step(state, agent.snapshot(state), 1 / 60);
  }
  assert.equal(state.status, 'ascending');
  assert.equal(state.encounter.coreUnlocked, true);
  assert.equal(state.encounter.phaseIgnited, true);
  assert.deepEqual(state.encounter.anchors, { north: 0, south: 0, phase: 0 });
  assert.equal(state.objects.find((object) => object.id === 'core').active, false);
  assert.ok(state.player.mass >= STELLAR_IGNITION_MASS);
  assert.equal(state.player.fuel, STELLAR_FUEL_TARGET);
  assert.equal(state.player.ignited, true);
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
