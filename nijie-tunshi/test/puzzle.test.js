import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/game/level.js';
import { analyzePuzzle, applyPuzzleMove, commitPuzzle, createPuzzleState, scorePuzzle, slideModules } from '../src/game/puzzle.js';

test('row and column slides are deterministic and reversible', () => {
  const initial = createPuzzleState();
  const move = { axis: 'row', index: 1, delta: -1 };
  const moved = applyPuzzleMove(initial, move);
  const restored = applyPuzzleMove(moved, { axis: 'row', index: 1, delta: 1 });
  assert.equal(moved.moduleMoves, 1);
  assert.deepEqual(restored.board, initial.board);
  assert.equal(restored.moduleMoves, 2);
});

test('cyclic slides preserve every module exactly once', () => {
  let board = createPuzzleState().board;
  board = slideModules(board, { axis: 'column', index: 1, delta: -1 });
  board = slideModules(board, { axis: 'row', index: 2, delta: 1 });
  assert.deepEqual([...board].sort(), [...LEVEL.puzzle.initialBoard].sort());
});

test('initial board has no executable route to the checkpoint', () => {
  const analysis = analyzePuzzle(LEVEL.puzzle.initialBoard);
  assert.equal(analysis.executable, false);
  assert.ok(analysis.reason.length > 0);
});

test('fixed teaching solution produces the planned growth route', () => {
  let board = LEVEL.puzzle.initialBoard;
  for (const move of LEVEL.puzzle.solutionMoves) board = slideModules(board, move);
  const analysis = analyzePuzzle(board);
  assert.equal(analysis.executable, true, analysis.reason);
  assert.deepEqual(analysis.route.map((step) => step.moduleId), ['start', 'mass-a', 'middle-a', 'mass-b', 'gate-height', 'mass-c', 'checkpoint']);
  assert.deepEqual(analysis.route.flatMap((step) => step.collections), ['orb-1', 'orb-2', 'orb-4', 'cylinder-1']);
  assert.ok(analysis.mass >= 12);
  assert.ok(analysis.height >= 1.9);
});

test('gates reject invalid height and oversized mass', () => {
  const narrow = { color: 'white', gate: { massMax: 2 } };
  const port = { color: 'white' };
  const board = ['start', 'gate-narrow', 'checkpoint', 'mass-a', 'mass-b', 'middle-a', 'bypass', 'mass-c', 'gate-height'];
  const analysis = analyzePuzzle(board, 3);
  assert.equal(analysis.executable, false);
  assert.match(analysis.reason, /体型需|缺口|高度|颜色/);
  void narrow;
  void port;
});

test('commit requires an executable layout and records travel steps', () => {
  let state = createPuzzleState();
  let result = commitPuzzle(state);
  assert.equal(result.committed, false);
  for (const move of LEVEL.puzzle.solutionMoves) state = applyPuzzleMove(state, move);
  result = commitPuzzle(state);
  assert.equal(result.committed, true);
  assert.equal(result.state.travelSteps, result.analysis.travelSteps);
  assert.equal(result.state.committed, true);
});

test('stars use module moves, travel steps, and hint tier', () => {
  let state = createPuzzleState();
  for (const move of LEVEL.puzzle.solutionMoves) state = applyPuzzleMove(state, move);
  state = { ...state, travelSteps: 6 };
  assert.equal(scorePuzzle(state).stars, 3);
  assert.equal(scorePuzzle({ ...state, moduleMoves: 4, travelSteps: 7 }).stars, 2);
  assert.equal(scorePuzzle({ ...state, hintTier: 2 }).stars, 2);
  assert.equal(scorePuzzle({ ...state, hintTier: 3 }).stars, 1);
  assert.equal(scorePuzzle(state, { assisted: true }).stars, 0);
});
