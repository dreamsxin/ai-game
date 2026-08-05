import assert from 'node:assert/strict';
import test from 'node:test';
import { createDialogueService } from '../server/dialogueService.js';
import { createInvestigationService } from '../server/investigationService.js';
import { createLlmClient } from '../server/llmClient.js';
import { createSessionStore } from '../server/sessionStore.js';

function createService() {
  const store = createSessionStore();
  const dialogueService = createDialogueService({ llmClient: createLlmClient({ fetchImpl: async () => { throw new Error('offline'); } }) });
  return createInvestigationService({ store, dialogueService });
}

test('the fixed evidence chain can solve the case without AI', async () => {
  const service = createService();
  let game = service.start();
  const update = result => { game = result; return result; };
  const action = action => update(service.action(game.gameId, game.state.version, action));
  const confront = (targetId, evidenceId) => update(service.confront(game.gameId, game.state.version, { targetId, evidenceId }));

  action({ type: 'inspect', hotspotId: 'frame-backing' });
  action({ type: 'inspect', hotspotId: 'print-surface' });
  action({ type: 'inspect', hotspotId: 'setup-photo' });
  action({ type: 'visit', locationId: 'print-room' });
  action({ type: 'inspect', hotspotId: 'printer-console' });
  action({ type: 'visit', locationId: 'corridor' });
  action({ type: 'inspect', hotspotId: 'access-terminal' });
  confront('su-wan', 'sw-signature');
  action({ type: 'visit', locationId: 'old-studio' });
  action({ type: 'inspect', hotspotId: 'checkout-book' });
  action({ type: 'inspect', hotspotId: 'locked-cabinet' });

  const preAccusation = JSON.stringify(game.state);
  assert.equal(game.state.evidence.some(item => item.id === 'original-painting'), true);
  assert.equal(preAccusation.includes('culpritId'), false);

  update(service.submitAccusation(game.gameId, game.state.version, {
    suspectId: 'lin-xia',
    motiveId: 'hide-coauthorship',
    locationId: 'old-studio',
    evidenceIds: ['print-dots', 'sw-signature', 'print-log', 'access-log', 'shared-sketch', 'original-painting'],
  }));

  assert.equal(game.state.result, 'solved');
  assert.equal(game.state.reveal.culpritId, 'lin-xia');
  assert.match(game.state.reveal.summary, /林夏/);
});

test('version conflicts reject stale actions', () => {
  const service = createService();
  const game = service.start();
  service.action(game.gameId, 0, { type: 'inspect', hotspotId: 'frame-backing' });
  assert.throws(
    () => service.action(game.gameId, 0, { type: 'inspect', hotspotId: 'setup-photo' }),
    error => error.code === 'version_conflict',
  );
});
