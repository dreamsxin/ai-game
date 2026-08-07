export const LEVEL_SEED = 482193;

export const LEVEL = {
  seed: LEVEL_SEED,
  bounds: { minX: -26, maxX: 26, minZ: -18, maxZ: 22 },
  start: { x: -19, z: 13 },
  exit: { x: 20, z: -13, radius: 2.4 },
  obstacles: [
    { id: 'wall-a', x: -6, z: 3, width: 3, depth: 8, height: 1.2 },
    { id: 'wall-b', x: 8, z: 7, width: 4, depth: 9, height: 1.2 },
    { id: 'wall-c', x: -3, z: -9, width: 11, depth: 3, height: 1.2 },
    { id: 'wall-d', x: 16, z: -3, width: 3, depth: 8, height: 1.2 },
  ],
  structures: [
    { id: 'crystal-panel', kind: 'breakable', x: -16.4, z: 13, width: 0.55, depth: 5.2, height: 2.8, integrity: 1, color: 0x73fbd3 },
    { id: 'risk-panel', kind: 'breakable', x: 1, z: 10, width: 0.7, depth: 5.5, height: 3.3, integrity: 1, color: 0xffaf73 },
    { id: 'phase-gate', kind: 'phaseable', x: 4, z: -4, width: 6.2, depth: 0.55, height: 4.2, integrity: 1, color: 0xd66cff },
  ],
  anchors: [
    { id: 'north', x: 10.5, z: -9.5, radius: 1.15, ability: 'dash', color: 0xffaf73 },
    { id: 'south', x: 16.8, z: -9.8, radius: 1.15, ability: 'gravity', color: 0x73fbd3 },
  ],
  objects: [
    { id: 'orb-1', type: 'orb', x: -17, z: 13, size: 0.65, mass: 1.2, color: 0x73fbd3 },
    { id: 'orb-2', type: 'orb', x: -11, z: 15, size: 0.8, mass: 2, color: 0x73fbd3 },
    { id: 'orb-3', type: 'orb', x: -15, z: 7, size: 0.95, mass: 3, color: 0x8bf8ff },
    { id: 'orb-4', type: 'orb', x: -7, z: 14, size: 1.05, mass: 4, color: 0xffaf73 },
    { id: 'cylinder-1', type: 'cylinder', x: -2, z: 14, size: 1.15, mass: 7, color: 0xff8ac6 },
    { id: 'cube-1', type: 'cube', x: 3, z: 13, size: 1.35, mass: 10, color: 0xb2ff78 },
    { id: 'prism-1', type: 'prism', x: 12, z: 14, size: 1.55, mass: 15, color: 0xffca70 },
    { id: 'orb-5', type: 'orb', x: -17, z: 1, size: 1.1, mass: 5, color: 0x8bf8ff },
    { id: 'cylinder-2', type: 'cylinder', x: -12, z: -2, size: 1.3, mass: 9, color: 0x73fbd3 },
    { id: 'cube-2', type: 'cube', x: -4, z: 2, size: 1.5, mass: 13, color: 0xffaf73 },
    { id: 'prism-2', type: 'prism', x: 4, z: 3, size: 1.7, mass: 18, color: 0xff8ac6 },
    { id: 'crystal-1', type: 'crystal', x: 11, z: 2, size: 1.85, mass: 24, color: 0x8bf8ff },
    { id: 'cube-3', type: 'cube', x: -14, z: -11, size: 1.7, mass: 20, color: 0xb2ff78 },
    { id: 'crystal-2', type: 'crystal', x: -8, z: -13, size: 2.1, mass: 29, color: 0xffca70 },
    { id: 'prism-3', type: 'prism', x: 3, z: -14, size: 2.25, mass: 38, color: 0xff8ac6 },
    { id: 'core', type: 'core', x: 13, z: -12, size: 2.5, mass: 52, color: 0xffffff, protected: true },
    { id: 'shard-a', type: 'orb', x: -5, z: 11, size: 0.3, mass: 1, color: 0xa2ffe8, gravity: true },
    { id: 'shard-b', type: 'orb', x: -3.5, z: 10, size: 0.3, mass: 1, color: 0xa2ffe8, gravity: true },
    { id: 'shard-c', type: 'orb', x: -5.5, z: 8.8, size: 0.3, mass: 1, color: 0xa2ffe8, gravity: true },
  ],
};

export const TYPE_LABELS = {
  orb: '光球', cylinder: '圆柱', cube: '方块', prism: '三棱柱', crystal: '晶簇', core: '核心',
};
