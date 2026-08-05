import { caseData, visibleCaseMetadata } from './caseData.js';

export class CaseError extends Error {
  constructor(message, { code = 'invalid_action', status = 400 } = {}) {
    super(message);
    this.name = 'CaseError';
    this.code = code;
    this.status = status;
  }
}

function unique(items) {
  return [...new Set(items)];
}

function hasAll(state, evidenceIds = []) {
  return evidenceIds.every(id => state.evidenceIds.includes(id));
}

function addEvidence(state, evidenceId) {
  if (!evidenceId || state.evidenceIds.includes(evidenceId)) return false;
  state.evidenceIds.push(evidenceId);
  return true;
}

function addTimeline(state, timelineId) {
  if (!timelineId || state.timelineIds.includes(timelineId)) return false;
  state.timelineIds.push(timelineId);
  return true;
}

function addFact(state, factId) {
  if (!factId || state.discoveredFactIds.includes(factId)) return false;
  state.discoveredFactIds.push(factId);
  return true;
}

function unlockedLocationIds(state) {
  return Object.values(caseData.locations)
    .filter(location => hasAll(state, location.unlockEvidenceIds))
    .map(location => location.id);
}

function objectiveFor(state) {
  if (state.result === 'solved') return '案件已解决：查看真相还原。';
  if (state.result === 'failed') return '指控机会已用尽：查看案件复盘。';
  if (!state.evidenceIds.includes('print-dots')) return '检查展厅中的画框与作品表面。';
  if (!state.evidenceIds.includes('print-log')) return '前往数字打印室，寻找复制品的制作记录。';
  if (!state.evidenceIds.includes('access-log')) return '调查东翼门禁，确认谁在闭馆后出现。';
  if (!state.evidenceIds.includes('shared-sketch')) return '询问苏晚，并用原作缩写与她对质。';
  if (!state.evidenceIds.includes('original-painting')) return '调查旧画材室，找到原作的藏匿位置。';
  return '整理证据，提交调包者、动机和原作位置。';
}

export function createInitialState() {
  return {
    caseId: caseData.id,
    caseVersion: caseData.version,
    version: 0,
    phase: 'investigating',
    currentLocationId: 'gallery',
    visitedLocationIds: ['gallery'],
    inspectedHotspotIds: [],
    evidenceIds: [],
    timelineIds: [],
    discoveredFactIds: [],
    confrontationKeys: [],
    dialogue: Object.fromEntries(Object.keys(caseData.characters).map(id => [id, []])),
    accusationAttempts: 0,
    result: null,
    lastEvent: { type: 'case_started', message: caseData.opening },
  };
}

function cloneState(state) {
  return structuredClone(state);
}

function commit(state, event) {
  state.version += 1;
  state.lastEvent = event;
  return { state, event, changed: true };
}

function unchanged(state, event) {
  return { state, event, changed: false };
}

function ensureActive(state) {
  if (state.result) throw new CaseError('The case is already closed.', { code: 'case_closed', status: 409 });
}

export function visitLocation(current, locationId) {
  ensureActive(current);
  const location = caseData.locations[locationId];
  if (!location) throw new CaseError('Unknown location.', { code: 'unknown_location' });
  if (!unlockedLocationIds(current).includes(locationId)) {
    throw new CaseError('This location is still locked.', { code: 'location_locked', status: 409 });
  }
  if (current.currentLocationId === locationId) {
    return unchanged(current, { type: 'location_unchanged', locationId, message: `你仍在${location.name}。` });
  }
  const state = cloneState(current);
  state.currentLocationId = locationId;
  state.visitedLocationIds = unique([...state.visitedLocationIds, locationId]);
  return commit(state, { type: 'location_visited', locationId, message: `来到${location.name}。${location.description}` });
}

export function inspectHotspot(current, hotspotId) {
  ensureActive(current);
  const hotspot = caseData.hotspots[hotspotId];
  if (!hotspot) throw new CaseError('Unknown scene hotspot.', { code: 'unknown_hotspot' });
  if (hotspot.locationId !== current.currentLocationId) {
    throw new CaseError('The hotspot is not in the current location.', { code: 'wrong_location', status: 409 });
  }
  if (!hasAll(current, hotspot.requiresEvidenceIds)) {
    throw new CaseError('More evidence is needed before inspecting this area.', { code: 'evidence_required', status: 409 });
  }
  if (current.inspectedHotspotIds.includes(hotspotId)) {
    return unchanged(current, { type: 'hotspot_revisited', hotspotId, message: hotspot.description });
  }
  const state = cloneState(current);
  state.inspectedHotspotIds.push(hotspotId);
  addEvidence(state, hotspot.evidenceId);
  addTimeline(state, hotspot.timelineId);
  return commit(state, {
    type: 'hotspot_inspected',
    hotspotId,
    evidenceId: hotspot.evidenceId,
    title: hotspot.title,
    message: hotspot.description,
  });
}

export function recordDialogue(current, { characterId, question, responseId, text, mood = 'guarded', provider = 'local' }) {
  ensureActive(current);
  const character = caseData.characters[characterId];
  const fact = caseData.facts[responseId];
  if (!character || !fact || fact.characterId !== characterId) {
    throw new CaseError('Dialogue response is not allowed.', { code: 'invalid_dialogue' });
  }
  if (!hasAll(current, fact.requiresEvidenceIds)) {
    throw new CaseError('Dialogue fact is not unlocked.', { code: 'fact_locked', status: 409 });
  }
  const state = cloneState(current);
  const message = {
    id: `${characterId}-${state.version + 1}-${state.dialogue[characterId].length}`,
    question,
    responseId,
    text,
    mood,
    provider,
  };
  state.dialogue[characterId].push(message);
  addFact(state, responseId);
  const gainedEvidence = addEvidence(state, fact.grantsEvidenceId);
  return commit(state, {
    type: 'dialogue_completed',
    characterId,
    responseId,
    evidenceId: gainedEvidence ? fact.grantsEvidenceId : null,
    message: text,
  });
}

export function confrontCharacter(current, targetId, evidenceId) {
  ensureActive(current);
  if (!caseData.characters[targetId]) throw new CaseError('Unknown character.', { code: 'unknown_character' });
  if (!current.evidenceIds.includes(evidenceId)) {
    throw new CaseError('You have not collected this evidence.', { code: 'evidence_not_collected', status: 409 });
  }
  const key = `${targetId}:${evidenceId}`;
  const rule = caseData.confrontations[key];
  if (!rule) {
    return unchanged(current, {
      type: 'confrontation_failed', targetId, evidenceId,
      message: '这件证据与当前证词没有形成直接矛盾。换一个角度再试。',
    });
  }
  const fact = caseData.facts[rule.responseId];
  if (!fact || !hasAll(current, [...(rule.requiresEvidenceIds || []), ...(fact.requiresEvidenceIds || [])])) {
    throw new CaseError('The contradiction is not established yet.', { code: 'evidence_required', status: 409 });
  }
  if (current.confrontationKeys.includes(key)) {
    return unchanged(current, { type: 'confrontation_repeated', targetId, evidenceId, message: rule.message });
  }
  const state = cloneState(current);
  state.confrontationKeys.push(key);
  addFact(state, rule.responseId);
  const gainedEvidence = addEvidence(state, rule.grantsEvidenceId);
  if (fact) {
    state.dialogue[targetId].push({
      id: `${targetId}-confront-${state.version + 1}`,
      question: `出示证据：${caseData.evidence[evidenceId].name}`,
      responseId: rule.responseId,
      text: fact.text,
      mood: 'shaken',
      provider: 'scripted',
    });
  }
  return commit(state, {
    type: 'confrontation_succeeded', targetId, evidenceId,
    evidenceIdGranted: gainedEvidence ? rule.grantsEvidenceId : null,
    message: rule.message,
  });
}

export function accuse(current, accusation) {
  ensureActive(current);
  const { suspectId, motiveId, locationId, evidenceIds } = accusation || {};
  if (!caseData.characters[suspectId] || !caseData.accusationOptions.motives.some(item => item.id === motiveId) ||
      !caseData.accusationOptions.locations.some(item => item.id === locationId)) {
    throw new CaseError('Accusation is incomplete.', { code: 'invalid_accusation' });
  }
  if (!Array.isArray(evidenceIds) || evidenceIds.length < 3 || evidenceIds.some(id => !current.evidenceIds.includes(id))) {
    throw new CaseError('Select at least three collected pieces of evidence.', { code: 'insufficient_evidence', status: 409 });
  }
  const truth = caseData.truth;
  const coreEvidenceCount = unique(evidenceIds).filter(id => truth.requiredEvidenceIds.includes(id)).length;
  const solved = suspectId === truth.culpritId && motiveId === truth.motiveId && locationId === truth.locationId &&
    coreEvidenceCount >= 3 && current.evidenceIds.includes('original-painting');
  const state = cloneState(current);
  state.accusationAttempts += 1;
  if (solved) {
    state.result = 'solved';
    state.phase = 'closed';
    return commit(state, { type: 'case_solved', message: '证据链闭合。你找回了原作，也还原了调包的真正动机。' });
  }
  const remaining = caseData.maxAccusations - state.accusationAttempts;
  if (remaining <= 0) {
    state.result = 'failed';
    state.phase = 'closed';
    return commit(state, { type: 'case_failed', message: '开展时间已到，案件进入校方复盘。' });
  }
  return commit(state, { type: 'accusation_rejected', remaining, message: `这套推理仍有断点。你还可以提交 ${remaining} 次正式指控。` });
}

export function applyAction(state, action) {
  if (!action || typeof action !== 'object') throw new CaseError('Action is required.');
  if (action.type === 'visit') return visitLocation(state, action.locationId);
  if (action.type === 'inspect') return inspectHotspot(state, action.hotspotId);
  throw new CaseError('Unsupported action.', { code: 'unsupported_action' });
}

function projectedHotspot(state, hotspot) {
  const inspected = state.inspectedHotspotIds.includes(hotspot.id);
  const available = hasAll(state, hotspot.requiresEvidenceIds);
  return {
    id: hotspot.id,
    locationId: hotspot.locationId,
    label: hotspot.label,
    icon: hotspot.icon,
    x: hotspot.x,
    y: hotspot.y,
    width: hotspot.width,
    height: hotspot.height,
    inspected,
    available,
    title: inspected ? hotspot.title : hotspot.label,
    description: inspected ? hotspot.description : null,
  };
}

export function projectState(state) {
  const unlocked = unlockedLocationIds(state);
  const evidence = state.evidenceIds.map(id => caseData.evidence[id]);
  const timeline = state.timelineIds.map(id => caseData.timeline[id])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const locations = Object.values(caseData.locations).map(location => ({
    id: location.id,
    name: location.name,
    shortName: location.shortName,
    description: location.description,
    image: location.image,
    unlocked: unlocked.includes(location.id),
    visited: state.visitedLocationIds.includes(location.id),
    hotspots: unlocked.includes(location.id) ? location.hotspots.map(id => projectedHotspot(state, caseData.hotspots[id])) : [],
  }));
  const characters = Object.values(caseData.characters).map(character => ({
    id: character.id,
    name: character.name,
    role: character.role,
    image: character.image,
    color: character.color,
    intro: character.intro,
    quickQuestions: character.quickQuestions,
    dialogue: state.dialogue[character.id],
  }));
  const projection = {
    case: visibleCaseMetadata(),
    version: state.version,
    phase: state.phase,
    result: state.result,
    currentLocationId: state.currentLocationId,
    objective: objectiveFor(state),
    progress: { found: evidence.length, total: Object.keys(caseData.evidence).length },
    accusationAttempts: state.accusationAttempts,
    accusationsRemaining: caseData.maxAccusations - state.accusationAttempts,
    lastEvent: state.lastEvent,
    locations,
    evidence,
    timeline,
    characters,
    accusationOptions: {
      suspects: Object.values(caseData.characters).map(({ id, name, role, image }) => ({ id, name, role, image })),
      motives: caseData.accusationOptions.motives,
      locations: caseData.accusationOptions.locations,
    },
  };
  if (state.result === 'solved') {
    projection.reveal = {
      solved: true,
      culpritId: caseData.truth.culpritId,
      motiveId: caseData.truth.motiveId,
      locationId: caseData.truth.locationId,
      summary: caseData.truth.summary,
    };
  }
  return projection;
}
