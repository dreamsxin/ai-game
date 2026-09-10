// 纯几何：把体素列表烘成裸数组，隐藏面直接剔除。渲染层再包成 BufferGeometry。
// 这一层不 import three，所以能在 node 里直接测。
const FACES = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
];

// 各朝向的固定明暗，烘进顶点色。有了它即使只用一盏灯，方块的转折也读得出来。
const FACE_SHADE = [0.82, 0.9, 0.62, 1, 0.72, 0.96];

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

export function buildVoxelMesh(voxels, { size = 1, origin = null, shade = true } = {}) {
  // 后写入的同坐标体素覆盖前者，这样细节层（跃迁垫、门框）可以直接叠在基础块上。
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
    for (let index = 0; index < FACES.length; index += 1) {
      const face = FACES[index];
      const neighbour = key(voxel.x + face.dir[0], voxel.y + face.dir[1], voxel.z + face.dir[2]);
      if (cells.has(neighbour)) continue;
      const tint = shade ? FACE_SHADE[index] : 1;
      const base = positions.length / 3;
      for (const corner of face.corners) {
        positions.push(
          (voxel.x + corner[0] - pivot[0]) * size,
          (voxel.y + corner[1] - pivot[1]) * size,
          (voxel.z + corner[2] - pivot[2]) * size,
        );
        normals.push(face.dir[0], face.dir[1], face.dir[2]);
        colors.push(rgb[0] * tint, rgb[1] * tint, rgb[2] * tint);
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
