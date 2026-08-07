import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/game/level.js';
import { createAutopilot } from '../src/game/autopilot.js';
import { canEnterExit, createGame, enterPlanning, movePuzzle, radiusForMass, startGame, step, submitPuzzle, togglePause, usePuzzleHint } from '../src/game/simulation.js';

test('planning requires a solved board and compiles the growth route', () => {
  let state = enterPlanning(createGame());
  assert.equal(state.status, 'planning');
  state = submitPuzzle(state);
  assert.equal(state.status, 'planning');
  for (const move of LEVEL.puzzle.solutionMoves) state = movePuzzle(state, move);
  state = submitPuzzle(state);
  assert.equal(state.status, 'playing');
  assert.deepEqual(state.plannedRoute.map((node) => node.id), LEVEL.firstStageRoute);
  assert.equal(state.puzzle.committed, true);
  assert.equal(state.routeScore.stars, 3);
});

test('puzzle hints advance without changing the board and reduce route score', () => {
  let state = enterPlanning(createGame());
  const board = state.puzzle.board;
  state = usePuzzleHint(usePuzzleHint(state));
  assert.deepEqual(state.puzzle.board, board);
  assert.equal(state.puzzle.hintTier, 2);
  for (const move of LEVEL.puzzle.solutionMoves) state = movePuzzle(state, move);
  state = submitPuzzle(state);
  assert.equal(state.routeScore.stars, 2);
});

test('same seed and input sequence produce the same state', () => {
  let left = startGame(createGame(77));
  let right = startGame(createGame(77));
  for (let index = 0; index < 120; index += 1) {
    const input = { x: index % 3 === 0 ? 1 : 0, z: index % 5 === 0 ? -1 : 0 };
    left = step(left, input);
    right = step(right, input);
  }
  assert.deepEqual(left, right);
});

test('diagonal input is normalized', () => {
  let state = startGame(createGame());
  state = step(state, { x: 1, z: 1 }, 1 / 60);
  assert.ok(Math.hypot(state.player.vx, state.player.vz) < 1);
});

test('player stays inside level bounds', () => {
  let state = startGame(createGame());
  for (let index = 0; index < 600; index += 1) state = step(state, { x: -1, z: 1 });
  assert.ok(state.player.x >= LEVEL.bounds.minX + state.player.radius);
  assert.ok(state.player.z <= LEVEL.bounds.maxZ - state.player.radius);
});

test('mass gate prevents oversized objects', () => {
  let state = startGame(createGame());
  state.player.x = LEVEL.objects.at(-1).x;
  state.player.z = LEVEL.objects.at(-1).z;
  state = step(state, {});
  assert.equal(state.objects.at(-1).active, true);
});

test('collecting objects increases mass and radius', () => {
  let state = startGame(createGame());
  state.player.x = LEVEL.objects[0].x;
  state.player.z = LEVEL.objects[0].z;
  state = step(state, {});
  assert.equal(state.objects[0].active, false);
  assert.equal(state.collected, 1);
  assert.ok(state.player.mass > 0);
  assert.equal(state.player.radius, radiusForMass(state.player.mass));
  assert.equal(state.collectionEvents.length, 1);
  assert.equal(state.collectionEvents[0].objectId, LEVEL.objects[0].id);
  assert.equal(state.collectionEvents[0].type, LEVEL.objects[0].type);
});

test('crossing a stage threshold emits a stageUp event', () => {
  let state = startGame(createGame());
  state.player.mass = 10;
  state.player.radius = radiusForMass(state.player.mass);
  state.player.x = LEVEL.objects[5].x;
  state.player.z = LEVEL.objects[5].z;
  const orb5 = LEVEL.objects.find((o) => o.id === 'orb-5');
  state.player.x = orb5.x;
  state.player.z = orb5.z;
  state = step(state, {});
  assert.ok(state.player.mass >= 12);
  assert.equal(state.stageUpEvents.length, 1);
  assert.ok(state.stageUpEvents[0].toStage > state.stageUpEvents[0].fromStage);
  const next = step(state, {});
  assert.equal(next.stageUpEvents.length, 0);
});

test('fixed first-level autopilot reaches the first stage deterministically', () => {
  let state = startGame(createGame());
  const autopilot = createAutopilot();
  autopilot.start();
  for (let index = 0; index < 2400 && state.player.mass < 12; index += 1) {
    state = step(state, autopilot.snapshot(state), 1 / 60);
  }
  assert.ok(state.player.mass >= 12);
  assert.ok(state.collected >= 3);
  assert.equal(state.stageUpEvents.at(-1).toStage, 1);
  assert.equal(autopilot.mode(), 'running');
});

test('fixed first-level autopilot continues through the exit into ascension', () => {
  let state = startGame(createGame());
  const autopilot = createAutopilot();
  autopilot.start();
  for (let index = 0; index < 30000 && state.status === 'playing'; index += 1) {
    state = step(state, autopilot.snapshot(state), 1 / 60);
  }
  assert.ok(state.player.mass >= 90, `mass=${state.player.mass}`);
  assert.equal(state.status, 'ascending');
  assert.ok(state.collected >= 8);
});

test('collection events only last for the collecting simulation step', () => {
  let state = startGame(createGame());
  state.player.x = LEVEL.objects[0].x;
  state.player.z = LEVEL.objects[0].z;
  state = step(state, {});
  assert.equal(state.collectionEvents.length, 1);
  const next = step(state, {});
  assert.equal(next.collectionEvents.length, 0);
});

test('pause freezes simulation and toggle resumes it', () => {
  let state = startGame(createGame());
  state = togglePause(state);
  const paused = step(state, { x: 1 }, 1);
  assert.deepEqual(paused, state);
  state = togglePause(state);
  assert.equal(state.status, 'playing');
});

test('exit requires enough mass and proximity', () => {
  const state = startGame(createGame());
  assert.equal(canEnterExit(state), false);
  state.player.mass = 90;
  state.player.x = LEVEL.exit.x;
  state.player.z = LEVEL.exit.z;
  assert.equal(canEnterExit(state), true);
});
