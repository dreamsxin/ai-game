export const ENCOUNTER_STAGES = [
  { id: 'awakening', minMass: 0, label: '冲破晶板，吞噬前方光球' },
  { id: 'gravity', minMass: 12, label: '中环已唤醒 · 牵引散落碎片' },
  { id: 'crossroads', minMass: 22, label: '选择路线 · 北侧迅捷，南侧稳妥' },
  { id: 'phase', minMass: 32, label: '外环已唤醒 · 穿越相位门' },
  { id: 'core', minMass: 60, label: '建立行星系统 · 收集恒星燃料' },
  { id: 'protostar', minMass: 90, label: '原恒星阶段 · 解除三轴点火锚点' },
  { id: 'ignition', minMass: 130, label: '满足点火条件 · 前往宇宙裂隙' },
];

export const createEncounterState = () => ({
  stage: 'awakening',
  route: null,
  phaseShortcut: false,
  phaseIgnited: false,
  anchors: { north: 2, south: 2, phase: 1 },
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
  state.encounter.coreUnlocked = state.encounter.anchors.north <= 0 && state.encounter.anchors.south <= 0;
  return nextStage.label;
}
