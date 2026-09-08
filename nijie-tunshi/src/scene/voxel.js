// 体素表面网格生成器。纯数组输出，不依赖 three，便于单元测试。
// 约定：形状定义在归一化坐标 [-1, 1]^3 上，由调用方缩放到实际尺寸。

const SHAPES = {
  // 果冻怪等球体：blocky 球
  sphere: (x, y, z) => x * x + y * y + z * z <= 1,
  // 软糖块：实心立方
  box: () => true,
  // 棒棒糖桩：沿 y 轴的圆柱
  cylinder: (x, y, z) => x * x + z * z <= 1,
  // 夹心角兽：xz 平面上的三角柱，底边在 -z、顶点朝 +z，铺满整个归一化盒
  prism: (x, y, z) => Math.abs(x) <= (1 - z) / 2,
  // 糖晶簇与糖心熔炉：八面体
  octahedron: (x, y, z) => Math.abs(x) + Math.abs(y) + Math.abs(z) <= 1,
};

export const VOXEL_SHAPES = Object.keys(SHAPES);

const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

const FACE_UVS = [[0, 0], [0, 1], [1, 1], [1, 0]];

// 方块面按法线轴向分层：顶面最亮、底面最暗，四个侧面区分前后与左右。
// 这是体素观感的主要来源，没有它一整块糖会糊成一个剪影。
const AXIS_BRIGHTNESS = {
  '0,1,0': 1,
  '0,-1,0': 0.58,
  '1,0,0': 0.88,
  '-1,0,0': 0.8,
  '0,0,1': 0.74,
  '0,0,-1': 0.66,
};

// 逐单元的确定性微差，打散大面积同色方块。不使用随机数，保证可复现。
const cellTint = (ix, iy, iz) => {
  const hash = Math.sin(ix * 12.9898 + iy * 78.233 + iz * 37.719) * 43758.5453;
  return hash - Math.floor(hash);
};

export const faceBrightness = (normal, ix = 0, iy = 0, iz = 0) => {
  const base = AXIS_BRIGHTNESS[normal.join(',')] ?? 1;
  return base * (0.96 + cellTint(ix, iy, iz) * 0.08);
};


export function voxelOccupancy(shape, resolution) {
  const test = SHAPES[shape];
  if (!test) throw new Error(`未知体素形状: ${shape}`);
  const size = Math.max(2, Math.floor(resolution));
  const cells = new Uint8Array(size * size * size);
  const step = 2 / size;
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        // 取单元中心，避免边界单元半悬空
        const x = -1 + (ix + 0.5) * step;
        const y = -1 + (iy + 0.5) * step;
        const z = -1 + (iz + 0.5) * step;
        if (test(x, y, z)) cells[ix + size * (iy + size * iz)] = 1;
      }
    }
  }
  return { cells, size };
}

// 只输出暴露面，内部面全部剔除。返回归一化到 [-1, 1] 的顶点数组。
export function voxelSurface(shape, resolution) {
  const { cells, size } = voxelOccupancy(shape, resolution);
  const at = (ix, iy, iz) => {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= size || iy >= size || iz >= size) return 0;
    return cells[ix + size * (iy + size * iz)];
  };
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const step = 2 / size;
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        if (!at(ix, iy, iz)) continue;
        for (const face of FACES) {
          const [nx, ny, nz] = face.normal;
          if (at(ix + nx, iy + ny, iz + nz)) continue;
          const shade = faceBrightness(face.normal, ix, iy, iz);
          // 四角按 0,1,2 与 0,2,3 拆成两个三角形
          const corner = (index) => {
            const [cx, cy, cz] = face.corners[index];
            return [
              -1 + (ix + cx) * step,
              -1 + (iy + cy) * step,
              -1 + (iz + cz) * step,
            ];
          };
          for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
            for (const index of [a, b, c]) {
              positions.push(...corner(index));
              normals.push(nx, ny, nz);
              uvs.push(...FACE_UVS[index]);
              colors.push(shade, shade, shade);
            }
          }
        }
      }
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    faceCount: positions.length / 9 / 2,
  };
}

// 各糖果类型的体素分辨率与半轴缩放，来自原平滑几何的等效体积。
export const VOXEL_PROFILES = {
  orb: { shape: 'sphere', resolution: 8, scale: [1, 1, 1] },
  cylinder: { shape: 'cylinder', resolution: 8, scale: [0.78, 1, 0.78] },
  cube: { shape: 'box', resolution: 5, scale: [0.775, 0.775, 0.775] },
  prism: { shape: 'prism', resolution: 8, scale: [1, 0.85, 1] },
  crystal: { shape: 'octahedron', resolution: 9, scale: [1, 1, 1] },
  core: { shape: 'octahedron', resolution: 11, scale: [1, 1, 1] },
};

export const voxelProfileFor = (type) => VOXEL_PROFILES[type] ?? VOXEL_PROFILES.orb;

