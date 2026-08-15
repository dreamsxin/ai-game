export const UNIVERSES = [
  {
    id: 'genesis', name: '初生星海', rule: '稳定引力',
    description: '基础天体演化，建立第一套卫星与行星环。',
    massScale: 1,
  },
  {
    id: 'antimatter', name: '反物质潮', rule: '极性质量',
    description: '质量密度提高，燃料天体在明暗极性间切换。',
    massScale: 1.04,
  },
  {
    id: 'binary', name: '双星摇篮', rule: '双核共振',
    description: '恒星点火需要维持两个核心的共同轨道。',
    massScale: 1.08,
  },
  {
    id: 'dark-matter', name: '暗物质深空', rule: '引力感知',
    description: '部分天体只在引力牵引时显形。',
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
