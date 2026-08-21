export const ENCOUNTER_STAGES = [
  { id: 'awakening', minMass: 0, label: '撞碎糖壳板，吞下前方果冻怪' },
  { id: 'gravity', minMass: 12, label: '第二糖釉环已醒 · 吸住散落糖屑' },
  { id: 'crossroads', minMass: 22, label: '选择甜味路线 · 北侧迅捷，南侧稳妥' },
  { id: 'phase', minMass: 32, label: '第三糖釉环已醒 · 穿过酸糖雾门' },
  { id: 'core', minMass: 60, label: '建立糖宠系统 · 收集夹心燃料' },
  { id: 'protostar', minMass: 90, label: '熔糖巨怪阶段 · 解除三枚糖核锚点' },
  { id: 'ignition', minMass: 130, label: '完成糖化爆发 · 前往彩虹糖洞' },
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
