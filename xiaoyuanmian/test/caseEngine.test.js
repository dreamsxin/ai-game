import assert from 'node:assert/strict';
import test from 'node:test';
import { CaseError, accuse, confrontCharacter, createInitialState, inspectHotspot, projectState, visitLocation } from '../server/caseEngine.js';

test('initial projection hides the case truth', () => {
  const projection = projectState(createInitialState());
  const serialized = JSON.stringify(projection);
  assert.equal(projection.currentLocationId, 'gallery');
  assert.equal(projection.locations.find(item => item.id === 'old-studio').unlocked, false);
  assert.equal(serialized.includes('culpritId'), false);
  assert.equal(serialized.includes('hide-coauthorship'), true);
  assert.equal(serialized.includes('林夏为掩盖'), false);
});

test('hotspot prerequisites and repeated inspection are deterministic', () => {
  const initial = createInitialState();
  assert.throws(
    () => inspectHotspot(initial, 'print-surface'),
    error => error instanceof CaseError && error.code === 'evidence_required',
  );
  const first = inspectHotspot(initial, 'frame-backing');
  assert.equal(first.state.version, 1);
  assert.deepEqual(first.state.evidenceIds, ['frame-marks']);
  const repeated = inspectHotspot(first.state, 'frame-backing');
  assert.equal(repeated.changed, false);
  assert.equal(repeated.state.version, 1);
});

test('locked locations reject early visits', () => {
  assert.throws(
    () => visitLocation(createInitialState(), 'old-studio'),
    error => error instanceof CaseError && error.code === 'location_locked',
  );
});

test('accusation requires collected evidence', () => {
  assert.throws(
    () => accuse(createInitialState(), {
      suspectId: 'lin-xia', motiveId: 'hide-coauthorship', locationId: 'old-studio',
      evidenceIds: ['print-dots', 'print-log', 'access-log'],
    }),
    error => error instanceof CaseError && error.code === 'insufficient_evidence',
  );
});

test('confrontations cannot bypass locked facts', () => {
  const accessState = createInitialState();
  accessState.evidenceIds = ['access-log'];
  const admission = confrontCharacter(accessState, 'lin-xia', 'access-log');
  assert.equal(admission.state.discoveredFactIds.includes('lin-access-admission'), true);
  assert.equal(admission.state.discoveredFactIds.includes('lin-coauthor-pressure'), false);

  const sketchState = createInitialState();
  sketchState.evidenceIds = ['access-log', 'shared-sketch'];
  assert.throws(
    () => confrontCharacter(sketchState, 'lin-xia', 'shared-sketch'),
    error => error instanceof CaseError && error.code === 'evidence_required',
  );
});

test('failed accusations never reveal the hidden truth', () => {
  let state = createInitialState();
  state.evidenceIds = ['print-dots', 'sw-signature', 'print-log'];
  const wrong = {
    suspectId: 'he-yu', motiveId: 'revenge-ranking', locationId: 'print-room',
    evidenceIds: ['print-dots', 'sw-signature', 'print-log'],
  };
  state = accuse(state, wrong).state;
  state = accuse(state, wrong).state;
  state = accuse(state, wrong).state;
  const projection = projectState(state);
  assert.equal(projection.result, 'failed');
  assert.equal(projection.reveal, undefined);
  assert.equal(JSON.stringify(projection).includes('林夏为掩盖'), false);
});
