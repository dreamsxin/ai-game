import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../server/createApp.js';
import { createDialogueService } from '../server/dialogueService.js';
import { createInvestigationService } from '../server/investigationService.js';
import { createSessionStore } from '../server/sessionStore.js';

async function withServer(run) {
  const dialogueService = createDialogueService({ llmClient: { generate: async () => { throw new Error('offline'); } } });
  const investigationService = createInvestigationService({ store: createSessionStore(), dialogueService });
  const server = createApp({ investigationService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('HTTP API starts, advances, and restores an authoritative session', async () => {
  await withServer(async base => {
    const started = await fetch(`${base}/api/case/start`, { method: 'POST' }).then(response => response.json());
    assert.equal(started.state.version, 0);
    const action = await fetch(`${base}/api/case/${started.gameId}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, action: { type: 'inspect', hotspotId: 'frame-backing' } }),
    }).then(response => response.json());
    assert.equal(action.state.version, 1);
    assert.equal(action.state.evidence[0].id, 'frame-marks');
    const restored = await fetch(`${base}/api/case/${started.gameId}`).then(response => response.json());
    assert.equal(restored.state.version, 1);
  });
});

test('HTTP API rejects malformed JSON with a stable error', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/case/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Request body must be valid JSON.', code: 'invalid_json' });
  });
});

test('HTTP API returns version conflicts without changing state', async () => {
  await withServer(async base => {
    const started = await fetch(`${base}/api/case/start`, { method: 'POST' }).then(response => response.json());
    await fetch(`${base}/api/case/${started.gameId}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, action: { type: 'inspect', hotspotId: 'frame-backing' } }),
    });
    const response = await fetch(`${base}/api/case/${started.gameId}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, action: { type: 'inspect', hotspotId: 'setup-photo' } }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'version_conflict');
  });
});
