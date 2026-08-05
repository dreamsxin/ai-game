import { accuse, applyAction, confrontCharacter, projectState, recordDialogue } from './caseEngine.js';

export function createInvestigationService({ store, dialogueService }) {
  function start() {
    const session = store.start();
    return { gameId: session.gameId, state: projectState(session.state) };
  }

  function getState(gameId) {
    const session = store.get(gameId);
    return { gameId, state: projectState(session.state) };
  }

  function action(gameId, expectedVersion, input) {
    const { session, result } = store.update(gameId, expectedVersion, state => applyAction(state, input));
    return { gameId, state: projectState(session.state), event: result.event };
  }

  async function dialogue(gameId, expectedVersion, input, { signal } = {}) {
    const snapshot = store.get(gameId);
    if (snapshot.state.version !== expectedVersion) {
      return store.update(gameId, expectedVersion, state => ({ state, changed: false, event: null }));
    }
    const response = await dialogueService.respond(snapshot.state, { ...input, signal });
    const { session, result } = store.update(gameId, expectedVersion, state => recordDialogue(state, {
      characterId: input.characterId,
      question: input.question,
      responseId: response.responseId,
      text: response.text,
      mood: response.mood,
      provider: response.provider,
    }));
    return { gameId, state: projectState(session.state), event: result.event, provider: response.provider, model: response.model };
  }

  function confront(gameId, expectedVersion, input) {
    const { session, result } = store.update(gameId, expectedVersion, state =>
      confrontCharacter(state, input?.targetId, input?.evidenceId));
    return { gameId, state: projectState(session.state), event: result.event };
  }

  function submitAccusation(gameId, expectedVersion, input) {
    const { session, result } = store.update(gameId, expectedVersion, state => accuse(state, input));
    return { gameId, state: projectState(session.state), event: result.event };
  }

  return { start, getState, action, dialogue, confront, submitAccusation };
}
