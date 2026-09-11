// 纯几何：把体素列表烘成裸数组，隐藏面直接剔除。渲染层再包成 BufferGeometry。
const FACES = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
];

const toLinear = (channel) =>
  (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

// 顶点色要给线性空间，否则 three 的 sRGB 输出会把体素调色板洗白。
export const linearRgb = (hex) => [
  toLinear(((hex >> 16) & 0xff) / 255),
  toLinear(((hex >> 8) & 0xff) / 255),
  toLinear((hex & 0xff) / 255),
];

export const box = (x0, y0, z0, width, height, depth, color) => {
  const voxels = [];
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let z = 0; z < depth; z += 1) {
        voxels.push({ x: x0 + x, y: y0 + y, z: z0 + z, color });
      }
    }
  }
  return voxels;
};

export function voxelBounds(voxels) {
  if (voxels.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const voxel of voxels) {
    const point = [voxel.x, voxel.y, voxel.z];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis] + 1);
    }
  }
  return { min, max };
}

const key = (x, y, z) => `${x},${y},${z}`;

export function buildVoxelMesh(voxels, { size = 1, origin = null } = {}) {
  // 后写入的同坐标体素覆盖前者，这样细节层（眼睛、鞋面）可以直接叠在基础块上。
  const cells = new Map();
  for (const voxel of voxels) cells.set(key(voxel.x, voxel.y, voxel.z), voxel);
  const bounds = voxelBounds([...cells.values()]);
  const pivot = origin ?? [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) / 2,
  ];

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let faceCount = 0;
  for (const voxel of cells.values()) {
    const rgb = linearRgb(voxel.color);
    for (const face of FACES) {
      const neighbour = key(voxel.x + face.dir[0], voxel.y + face.dir[1], voxel.z + face.dir[2]);
      if (cells.has(neighbour)) continue;
      const base = positions.length / 3;
      for (const corner of face.corners) {
        positions.push(
          (voxel.x + corner[0] - pivot[0]) * size,
          (voxel.y + corner[1] - pivot[1]) * size,
          (voxel.z + corner[2] - pivot[2]) * size,
        );
        normals.push(face.dir[0], face.dir[1], face.dir[2]);
        colors.push(rgb[0], rgb[1], rgb[2]);
      }
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      faceCount += 1;
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    faceCount,
    bounds,
    pivot,
  };
}

export const VOXEL_SIZE = 0.155;
const SKIN = 0xf2c48b;
const HAIR = 0x3a2418;
const SHIRT = 0xff8a3d;
const PANTS = 0x2b3a67;
const SHOE = 0xf5f5f5;
const EYE = 0x1b1b26;

// 跑者被拆成躯干和四条肢体，每块自带枢轴，渲染层只负责摆动角度。
export const RUNNER_PARTS = {
  body: {
    origin: [2, 0, 1.5],
    voxels: [
      ...box(0, 3, 0, 4, 5, 3, SHIRT),
      // 头比躯干往前突出一格，是体素角色常见的可爱比例。
      ...box(0, 8, -1, 4, 3, 4, SKIN),
      ...box(0, 10, -1, 4, 1, 4, HAIR),
      { x: 1, y: 9, z: -1, color: EYE },
      { x: 2, y: 9, z: -1, color: EYE },
    ],
  },
  armLeft: { origin: [-0.5, 8, 1.5], voxels: box(-1, 4, 1, 1, 4, 1, SHIRT) },
  armRight: { origin: [4.5, 8, 1.5], voxels: box(4, 4, 1, 1, 4, 1, SHIRT) },
  legLeft: {
    origin: [1, 3, 1.5],
    voxels: [...box(0, 1, 1, 2, 2, 2, PANTS), ...box(0, 0, 1, 2, 1, 2, SHOE)],
  },
  legRight: {
    origin: [3, 3, 1.5],
    voxels: [...box(2, 1, 1, 2, 2, 2, PANTS), ...box(2, 0, 1, 2, 1, 2, SHOE)],
  },
};

export const RUNNER_ROOT = RUNNER_PARTS.body.origin;

// 各部件在跑者根节点下的局部偏移，单位已换算成世界坐标。
export const partOffset = (part) => [
  (part.origin[0] - RUNNER_ROOT[0]) * VOXEL_SIZE,
  (part.origin[1] - RUNNER_ROOT[1]) * VOXEL_SIZE,
  (part.origin[2] - RUNNER_ROOT[2]) * VOXEL_SIZE,
];


