export const POLARITY_FLIP_DURATION = 0.65;

export const UNIVERSES = [
  {
    id: 'genesis', name: '软糖幼巢', rule: '稳定糖引力',
    description: '基础糖怪演化，建立第一套糖宠与糖釉光环。',
    massScale: 1,
  },
  {
    id: 'antimatter', name: '酸味反物质潮', rule: '甜酸极性',
    description: '糖果密度提高，夹心燃料在甜酸极性间切换。',
    massScale: 1.04,
    darkFuelIds: ['prism-1', 'crystal-2', 'core'],
  },
  {
    id: 'binary', name: '双糖摇篮', rule: '双核共糖化',
    description: '糖化爆发需要维持两个夹心核心的共同轨道。',
    massScale: 1.08,
  },
  {
    id: 'dark-matter', name: '黑糖深空', rule: '糖引力感知',
    description: '部分糖果怪只在糖引力牵引时显形。',
    massScale: 1.12,
  },
];

export function universeForIndex(index = 1) {
  const safeIndex = Math.max(1, Math.floor(Number(index) || 1));
  const definition = UNIVERSES[(safeIndex - 1) % UNIVERSES.length];
  const cycle = Math.floor((safeIndex - 1) / UNIVERSES.length);
  return {
    ...definition,
    index: safeIndex,
    cycle,
    massScale: definition.massScale + cycle * 0.04,
  };
}

export function createUniverseProgress(overrides = {}) {
  const index = Math.max(1, Math.floor(Number(overrides.index) || 1));
  const definition = universeForIndex(index);
  return {
    index,
    id: definition.id,
    name: definition.name,
    rule: definition.rule,
    description: definition.description,
    cycle: definition.cycle,
    cumulativeStars: Math.max(0, Number(overrides.cumulativeStars) || 0),
    bestCombo: Math.max(0, Number(overrides.bestCombo) || 0),
    completedRuns: Math.max(0, Number(overrides.completedRuns) || 0),
    discoveredRules: [...new Set(overrides.discoveredRules ?? [definition.rule])],
  };
}
