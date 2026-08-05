import { randomUUID } from 'node:crypto';
import { CaseError, createInitialState } from './caseEngine.js';

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export function createSessionStore({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const sessions = new Map();

  function prune() {
    const timestamp = now();
    for (const [id, session] of sessions) {
      if (timestamp - session.updatedAt > ttlMs) sessions.delete(id);
    }
  }

  function start() {
    prune();
    const gameId = randomUUID();
    const session = { gameId, state: createInitialState(), eventLog: [], updatedAt: now() };
    sessions.set(gameId, session);
    return structuredClone(session);
  }

  function get(gameId) {
    prune();
    const session = sessions.get(gameId);
    if (!session) throw new CaseError('Case session not found.', { code: 'session_not_found', status: 404 });
    return structuredClone(session);
  }

  function update(gameId, expectedVersion, updater) {
    prune();
    const session = sessions.get(gameId);
    if (!session) throw new CaseError('Case session not found.', { code: 'session_not_found', status: 404 });
    if (!Number.isInteger(expectedVersion) || expectedVersion !== session.state.version) {
      throw new CaseError('Case state has changed. Refresh and try again.', { code: 'version_conflict', status: 409 });
    }
    const result = updater(structuredClone(session.state));
    if (result.changed) {
      session.state = result.state;
      session.eventLog.push(result.event);
      session.updatedAt = now();
    }
    return { session: structuredClone(session), result };
  }

  function remove(gameId) {
    sessions.delete(gameId);
  }

  return { start, get, update, remove, size: () => sessions.size };
}
