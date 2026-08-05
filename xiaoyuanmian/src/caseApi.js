export class CaseApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'CaseApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CaseApiError(payload?.error || `Request failed: ${response.status}`, {
      status: response.status,
      code: payload?.code,
    });
  }
  if (!payload?.state || typeof payload.gameId !== 'string') throw new CaseApiError('The case service returned invalid data.');
  return payload;
}

export function startCase({ signal } = {}) {
  return request('/api/case/start', { method: 'POST', signal });
}

export function getCase(gameId, { signal } = {}) {
  return request(`/api/case/${encodeURIComponent(gameId)}`, { signal });
}

export function performAction(gameId, expectedVersion, action, { signal } = {}) {
  return request(`/api/case/${encodeURIComponent(gameId)}/action`, {
    method: 'POST', signal, body: JSON.stringify({ expectedVersion, action }),
  });
}

export function askCharacter(gameId, expectedVersion, characterId, question, { signal } = {}) {
  return request(`/api/case/${encodeURIComponent(gameId)}/dialogue`, {
    method: 'POST', signal, body: JSON.stringify({ expectedVersion, characterId, question }),
  });
}

export function confrontCharacter(gameId, expectedVersion, targetId, evidenceId, { signal } = {}) {
  return request(`/api/case/${encodeURIComponent(gameId)}/confront`, {
    method: 'POST', signal, body: JSON.stringify({ expectedVersion, targetId, evidenceId }),
  });
}

export function submitAccusation(gameId, expectedVersion, accusation, { signal } = {}) {
  return request(`/api/case/${encodeURIComponent(gameId)}/accuse`, {
    method: 'POST', signal, body: JSON.stringify({ expectedVersion, accusation }),
  });
}
