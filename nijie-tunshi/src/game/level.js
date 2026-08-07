export const LEVEL_SEED = 482193;

export const LEVEL = {
  seed: LEVEL_SEED,
  bounds: { minX: -26, maxX: 26, minZ: -18, maxZ: 22 },
  start: { x: -19, z: 13 },
  firstStageRoute: ['orb-1', 'orb-2', 'orb-4', 'cylinder-1'],
  puzzle: {
    rows: 3,
    columns: 3,
    moduleSize: 7.2,
    origin: { x: -19, z: 13 },
    entry: 'start',
    checkpoint: 'checkpoint',
    rating: { three: { moduleMoves: 4, travelSteps: 6 }, two: { moduleMoves: 6, travelSteps: 8 } },
    initialBoard: [
      'start', 'middle-a', 'gate-height',
      'mass-c', 'bypass', 'gate-narrow',
      'mass-a', 'mass-b', 'checkpoint',
    ],
    solutionMoves: [
      { axis: 'row', index: 1, delta: -1 },
      { axis: 'column', index: 1, delta: -1 },
      { axis: 'column', index: 0, delta: -1 },
      { axis: 'column', index: 1, delta: -1 },
    ],
    modules: {
      start: {
        label: '起点', fixed: true,
        ports: { north: { color: 'white' } },
        contents: [],
      },
      'mass-a': {
        label: '冰青光室',
        ports: { south: { color: 'white' }, east: { color: 'cyan' } },
        contents: [{ objectId: 'orb-1' }],
      },
      'middle-a': {
        label: '青纹回廊',
        ports: { west: { color: 'cyan' }, north: { color: 'coral' } },
        contents: [{ objectId: 'orb-2' }],
      },
      'mass-b': {
        label: '珊瑚光室',
        ports: { south: { color: 'coral' }, east: { color: 'gold' } },
        contents: [{ objectId: 'orb-4' }],
      },
      'gate-height': {
        label: 'H 1.9 矮墙',
        ports: {
          west: { color: 'gold', gate: { heightMin: 1.9 } },
          south: { color: 'white', gate: { heightMin: 1.9 } },
        },
        contents: [],
      },
      'gate-narrow': {
        label: '12–14 窄门',
        ports: {
          west: { color: 'white', gate: { massMin: 12, massMax: 14 } },
          east: { color: 'white', gate: { massMin: 12, massMax: 14 } },
          north: { color: 'white', gate: { massMin: 12, massMax: 14 } },
        },
        contents: [],
      },
      'mass-c': {
        label: '圆柱储能舱',
        ports: { north: { color: 'white' }, south: { color: 'white' } },
        contents: [{ objectId: 'cylinder-1' }],
      },
      bypass: {
        label: '未校准房间',
        ports: { east: { color: 'white' }, north: { color: 'white' } },
        contents: [],
      },
      checkpoint: {
        label: '虹彩检查点', fixed: true,
        ports: { north: { color: 'white' } },
        contents: [],
      },
    },
  },
  autoplayRoute: [
    { kind: 'object', id: 'orb-1' },
    { kind: 'object', id: 'orb-2' },
    { kind: 'object', id: 'orb-4' },
    { kind: 'object', id: 'cylinder-1' },
    { kind: 'object', id: 'cube-1' },
    { kind: 'object', id: 'prism-1' },
    { kind: 'point', x: 22, z: 14 },
    { kind: 'point', x: 22, z: -13 },
    { kind: 'object', id: 'prism-3' },
    { kind: 'object', id: 'crystal-2' },
    { kind: 'exit' },
  ],
  exit: { x: 20, z: -13, radius: 2.4 },
  obstacles: [
    { id: 'wall-a', x: -6, z: 3, width: 3, depth: 8, height: 1.2 },
    { id: 'wall-b', x: 8, z: 7, width: 4, depth: 9, height: 1.2 },
    { id: 'wall-c', x: -3, z: -9, width: 11, depth: 3, height: 1.2 },
    { id: 'wall-d', x: 16, z: -3, width: 3, depth: 8, height: 1.2 },
  ],
  objects: [
    { id: 'orb-1', type: 'orb', x: -14, z: 12, size: 0.65, mass: 1.2, color: 0x73fbd3 },
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
    { id: 'core', type: 'core', x: 13, z: -12, size: 2.5, mass: 52, color: 0xffffff },
  ],
};

export const TYPE_LABELS = {
  orb: '光球', cylinder: '圆柱', cube: '方块', prism: '三棱柱', crystal: '晶簇', core: '核心',
};
