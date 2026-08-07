export const ENCOUNTER_STAGES = [
  { id: 'awakening', minMass: 0, label: '冲破晶板，吞噬前方光球' },
  { id: 'gravity', minMass: 12, label: '中环已唤醒 · 牵引散落碎片' },
  { id: 'crossroads', minMass: 22, label: '选择路线 · 北侧迅捷，南侧稳妥' },
  { id: 'phase', minMass: 32, label: '外环已唤醒 · 穿越相位门' },
  { id: 'core', minMass: 60, label: '击破双锚点，解除核心锁定' },
  { id: 'ascension', minMass: 90, label: '三环共鸣 · 前往飞升锚点' },
];

export const createEncounterState = () => ({
  stage: 'awakening',
  route: null,
  phaseShortcut: false,
  anchors: { north: 2, south: 2 },
  coreUnlocked: false,
  brokenStructures: [],
});

export function encounterForMass(mass) {
  let stage = ENCOUNTER_STAGES[0];
  for (const candidate of ENCOUNTER_STAGES) {
    if (mass >= candidate.minMass) stage = candidate;
  }
  return stage;
}

export function updateEncounter(state) {
  const nextStage = encounterForMass(state.player.mass);
  state.encounter.stage = nextStage.id;
  if (!state.encounter.route && state.player.x > -2) {
    state.encounter.route = state.player.z < 5 ? 'swift' : 'steady';
  }
  state.encounter.coreUnlocked = Object.values(state.encounter.anchors).every((integrity) => integrity <= 0);
  return nextStage.label;
}
