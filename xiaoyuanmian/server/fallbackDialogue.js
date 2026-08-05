import { caseData } from './caseData.js';

const keywords = [
  { test: /昨晚|门禁|回来|时间/, preferred: ['lin-access-denial', 'chen-alibi', 'he-alibi'] },
  { test: /缩写|S\.W|署名|共同|草图/, preferred: ['lin-coauthor-pressure', 'su-coauthor', 'su-sketch', 'he-photo'] },
  { test: /钥匙|值班|画材室/, preferred: ['chen-key', 'chen-studio', 'chen-alibi'] },
  { test: /质疑|评审|第二名|名次/, preferred: ['he-criticism'] },
  { test: /原作|最后|见到/, preferred: ['lin-last-saw', 'su-coauthor', 'he-photo'] },
];

function availableFacts(state, characterId) {
  return Object.values(caseData.facts).filter(fact => fact.characterId === characterId &&
    (fact.requiresEvidenceIds || []).every(id => state.evidenceIds.includes(id)));
}

export function chooseFallbackResponse(state, characterId, question = '') {
  const available = availableFacts(state, characterId);
  if (!available.length) return null;
  for (const group of keywords) {
    if (!group.test.test(question)) continue;
    const fact = group.preferred.map(id => caseData.facts[id]).find(item => item && available.includes(item));
    if (fact) return { responseId: fact.responseId, mood: 'guarded', referencedFactIds: [fact.responseId] };
  }
  const unseen = available.find(fact => !state.discoveredFactIds.includes(fact.responseId));
  const fact = unseen || available[0];
  return { responseId: fact.responseId, mood: 'guarded', referencedFactIds: [fact.responseId] };
}
