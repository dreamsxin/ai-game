import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armillaryState,
  ORBITAL_SATELLITES,
  PLANETARY_RINGS,
  PLAYER_STAGES,
  planetaryRingState,
  playerVisualForMass,
  ringMotionState,
  satelliteOrbitState,
  stageChargeProgress,
} from '../src/game/progression.js';
import { ascensionProgress, canEnterExit, createGame, startGame, step } from '../src/game/simulation.js';
import { LEVEL } from '../src/game/level.js';

test('player visual stages increase energy without exceeding three rings', () => {
  const early = playerVisualForMass(0);
  const middle = playerVisualForMass(45);
  const final = playerVisualForMass(90);
  assert.equal(PLAYER_STAGES.length, 5);
  assert.equal(PLANETARY_RINGS.length, 3);
  assert.equal(early.ringCount, 1);
  assert.equal(middle.ringCount, 3);
  assert.equal(final.ringCount, 3);
  assert.ok(early.trailCount < final.trailCount);
  assert.equal(final.stageName, '高维');
  assert.equal(final.energy, 1);
});

test('planetary rings unlock only after the previous complete threshold', () => {
  const table = [
    [0, 1, 'inner', 0, false],
    [11.9, 1, 'inner', 11.9 / 12, false],
    [12, 2, 'middle', 0, false],
    [31.9, 2, 'middle', 19.9 / 20, false],
    [32, 3, 'outer', 0, false],
    [60, 3, 'outer', 28 / 58, false],
    [89, 3, 'outer', 57 / 58, false],
    [90, 3, 'outer', 1, true],
  ];
  for (const [mass, count, chargingId, progress, complete] of table) {
    const state = planetaryRingState(mass);
    assert.equal(state.rings.length, count, `mass=${mass}`);
    assert.equal(state.chargingRingId, chargingId, `mass=${mass}`);
    assert.ok(Math.abs(state.rings.at(-1).progress - progress) < 1e-9, `mass=${mass}`);
    assert.equal(state.complete, complete, `mass=${mass}`);
  }
});

test('visible ring records contain complete geometry and valid gradients', () => {
  const reference = PLANETARY_RINGS.map((ring) => ring.radius);
  for (const mass of [0, 12, 32, 60, 90]) {
    const state = planetaryRingState(mass);
    assert.deepEqual(state.rings.map((ring) => ring.radius), reference.slice(0, state.rings.length));
    for (const ring of state.rings) {
      assert.match(ring.trackColor, /^#[0-9a-f]{6}$/i);
      assert.match(ring.gradientStart, /^#[0-9a-f]{6}$/i);
      assert.match(ring.gradientEnd, /^#[0-9a-f]{6}$/i);
      assert.ok(ring.progress >= 0 && ring.progress <= 1);
      assert.ok(['charging', 'complete'].includes(ring.status));
    }
  }
});

test('stage palette progresses from silver white to vivid purple', () => {
  const early = playerVisualForMass(0);
  const middle = playerVisualForMass(45);
  const final = playerVisualForMass(90);
  assert.equal(early.coreColor, '#f1fbff');
  assert.notEqual(early.shellColor, middle.shellColor);
  assert.notEqual(middle.shellColor, final.shellColor);
  assert.match(final.shellColor, /^#[0-9a-f]{6}$/i);
  assert.ok(final.glow > early.glow);
  assert.ok(final.chargePulse > early.chargePulse);
});

test('visual stage interpolation is continuous between thresholds', () => {
  const stage = playerVisualForMass(20);
  assert.equal(stage.stageName, '虹彩');
  assert.ok(stage.stageProgress > 0 && stage.stageProgress < 1);
  assert.notEqual(stage.coreColor, PLAYER_STAGES[1].coreColor);
  assert.notEqual(stage.coreColor, PLAYER_STAGES[2].coreColor);
  assert.ok(stage.glow > PLAYER_STAGES[1].glow && stage.glow < PLAYER_STAGES[2].glow);
});

test('planetary rings rotate independently and carry directional energy flow', () => {
  const start = ringMotionState('playing', 0, 0);
  const later = ringMotionState('playing', 0, 5);
  assert.deepEqual(later.map((ring) => ring.direction), [1, -1, 1]);
  assert.ok(later[0].spin > start[0].spin);
  assert.ok(later[1].spin < start[1].spin);
  assert.ok(later[2].spin > start[2].spin);
  assert.ok(later.every((ring, index) => ring.flowPhase > start[index].flowPhase));
  assert.notEqual(Math.abs(later[0].spin), Math.abs(later[1].spin));
  assert.notEqual(later[0].flowPhase, later[2].flowPhase);
});

test('satellites ride on ring radius with short meteor tails that grow with charge', () => {
  const early = satelliteOrbitState(0, 3.5);
  const repeated = satelliteOrbitState(0, 3.5);
  const mid = satelliteOrbitState(12, 3.5);
  const advanced = satelliteOrbitState(32, 3.5);
  const full = satelliteOrbitState(90, 3.5);
  assert.equal(ORBITAL_SATELLITES.length, 3);
  assert.equal(early.length, 1);
  assert.equal(mid.length, 2);
  assert.equal(advanced.length, 3);
  assert.deepEqual(early, repeated);
  assert.deepEqual(advanced.map((satellite) => satellite.direction), [1, -1, 1]);
  for (const satellite of advanced) {
    assert.ok(satellite.size <= 0.075, `${satellite.id} size ${satellite.size} too large`);
  }
  assert.ok(early[0].radius < 1.32 && early[0].radius >= 1.0, 'lumen starts outside body');
  assert.ok(Math.abs(full[0].radius - 1.32) < 0.001, 'lumen reaches ring at full charge');
  assert.ok(Math.abs(full[2].radius - 1.74) < 0.001, 'violet reaches ring at full charge');
  assert.ok(early[0].trailArc < full[0].trailArc, 'tail grows with charge');
  assert.ok(full[0].trailArc <= 1.2, 'tail stays short');
  assert.ok(early[0].trailArc >= 0.4, 'tail has minimum length');
  assert.equal(early[0].angle, 0, 'satellite at charge start when 0%');
  const half = satelliteOrbitState(6, 0);
  assert.ok(Math.abs(half[0].angle - Math.PI) < 0.001, 'satellite halfway at 50% charge');
  const fullCharge = satelliteOrbitState(12, 0);
  assert.ok(fullCharge[0].angle < 0.001 || Math.abs(fullCharge[0].angle - Math.PI * 2) < 0.001, 'satellite full circle at 100% charge');
  assert.ok(Math.abs(early[0].tiltX - Math.PI / 2) < 0.01, 'lumen coplanar with inner ring');
});

test('satellite orbits spread further during ascension', () => {
  const stable = satelliteOrbitState(90, 2, 'playing', 0);
  const ascending = satelliteOrbitState(90, 2, 'ascending', 0.8);
  assert.equal(stable.length, 3);
  assert.notEqual(stable[1].tiltX, ascending[1].tiltX, 'ember ring tilts');
  assert.notEqual(stable[2].tiltY, ascending[2].tiltY, 'violet ring tilts');
});

test('armillary stays coplanar outside ascension', () => {
  for (const status of ['ready', 'playing', 'paused']) {
    const rings = armillaryState(status, 0.5);
    assert.ok(rings.every((ring) => ring.tiltX === Math.PI / 2 && ring.tiltY === 0 && ring.spin === 0));
  }
});

test('armillary uses deterministic different axes and opposite rotations while ascending', () => {
  const first = armillaryState('ascending', 0.5);
  const second = armillaryState('ascending', 0.5);
  assert.deepEqual(first, second);
  assert.notEqual(first[0].tiltX, first[1].tiltX);
  assert.notEqual(first[1].tiltY, first[2].tiltY);
  assert.deepEqual(first.map((ring) => ring.direction), [1, -1, 1]);
  assert.ok(first[0].spin > 0);
  assert.ok(first[1].spin < 0);
  assert.ok(first[2].spin > 0);
});

test('reaching the exit after consuming the core starts ascension', () => {
  let state = startGame(createGame());
  state.player.mass = 90;
  state.objects.find((object) => object.id === 'core').active = false;
  state.player.x = LEVEL.exit.x;
  state.player.z = LEVEL.exit.z;
  state = step(state, {});
  assert.equal(canEnterExit(state), true);
  assert.equal(state.status, 'ascending');
  assert.equal(ascensionProgress(state), 0);
});

test('ascension completes after its cinematic duration', () => {
  let state = startGame(createGame());
  state.player.mass = 90;
  state.objects.find((object) => object.id === 'core').active = false;
  state.player.x = LEVEL.exit.x;
  state.player.z = LEVEL.exit.z;
  state = step(state, {});
  state = step(state, {}, 2);
  assert.equal(state.status, 'ascending');
  assert.equal(ascensionProgress(state), 0.5);
  state = step(state, {}, 2);
  assert.equal(state.status, 'won');
  assert.equal(ascensionProgress(state), 1);
});

test('charge HUD follows the current ring rather than exposing half geometry', () => {
  assert.deepEqual(stageChargeProgress(6), {
    stageIndex: 0,
    ringIndex: 0,
    ringName: '第一共鸣环',
    progress: 0.5,
    nextThreshold: 12,
    complete: false,
  });
  const final = stageChargeProgress(90);
  assert.equal(final.ringName, '第三共鸣环');
  assert.equal(final.progress, 1);
  assert.equal(final.complete, true);
});
