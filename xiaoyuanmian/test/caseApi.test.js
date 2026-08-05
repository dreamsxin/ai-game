import assert from 'node:assert/strict';
import test from 'node:test';
import { CaseApiError, getCase, performAction, startCase } from '../src/caseApi.js';

const state = { version: 0 };

test('case API starts a session and validates the projection', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/case/start');
    assert.equal(options.method, 'POST');
    return new Response(JSON.stringify({ gameId: 'game-1', state }));
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.deepEqual(await startCase(), { gameId: 'game-1', state });
});

test('case API exposes stable server error codes', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'gone', code: 'session_not_found' }), { status: 404 });
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(getCase('missing'), error => error instanceof CaseApiError && error.code === 'session_not_found');
});

test('case API preserves caller cancellation', async t => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (_url, { signal }) => {
    called = true;
    signal.throwIfAborted();
    return new Response('{}');
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    performAction('game', 0, { type: 'visit', locationId: 'gallery' }, { signal: controller.signal }),
    error => error.name === 'AbortError',
  );
  assert.equal(called, true);
});
