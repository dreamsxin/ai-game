// 建筑体块与坐标换算。这里不 import three：几何只是数字数组，可以直接单测。
import { TERRAIN_FOREST, TERRAIN_GRASS, TERRAIN_WATER, TILE_SPAN } from '../game/rules.js';

// 单位立方体的六个面，corners 用 0/1 表示角点，绕向保证法线朝外。
const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

/** sRGB 十六进制转线性空间，交给顶点色用；否则灯光下整体会偏亮。 */
export function linearRgb(hex) {
  const channel = (value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return [
    channel((hex >> 16) & 0xff),
    channel((hex >> 8) & 0xff),
    channel(hex & 0xff),
  ];
}

/**
 * 把一组盒子焊成一份带顶点色的网格数据。
 * 建筑只有几百个盒子，逐面写数组比引 BufferGeometryUtils 更好读也更好测。
 * 盒子的 y 从 0 起算（贴地），x/z 以格子中心为原点。
 */
export function buildBoxMesh(boxes) {
  const faceCount = boxes.length * FACES.length;
  const positions = new Float32Array(faceCount * 12);
  const normals = new Float32Array(faceCount * 12);
  const colors = new Float32Array(faceCount * 12);
  const indices = new Uint16Array(faceCount * 6);
  let vertex = 0;
  let index = 0;
  for (const box of boxes) {
    const [sx, sy, sz] = box.size;
    const [ox, oy, oz] = [box.at?.[0] ?? 0, box.at?.[1] ?? 0, box.at?.[2] ?? 0];
    const color = linearRgb(box.color);
    for (const face of FACES) {
      const base = vertex;
      for (const corner of face.corners) {
        positions[vertex * 3] = ox - sx / 2 + corner[0] * sx;
        positions[vertex * 3 + 1] = oy + corner[1] * sy;
        positions[vertex * 3 + 2] = oz - sz / 2 + corner[2] * sz;
        normals[vertex * 3] = face.normal[0];
        normals[vertex * 3 + 1] = face.normal[1];
        normals[vertex * 3 + 2] = face.normal[2];
        colors[vertex * 3] = color[0];
        colors[vertex * 3 + 1] = color[1];
        colors[vertex * 3 + 2] = color[2];
        vertex += 1;
      }
      indices[index] = base;
      indices[index + 1] = base + 1;
      indices[index + 2] = base + 2;
      indices[index + 3] = base;
      indices[index + 4] = base + 2;
      indices[index + 5] = base + 3;
      index += 6;
    }
  }
  return { positions, normals, colors, indices };
}

// 每种建筑的体块。屋顶、烟囱、冷却塔这些小体块是唯一的辨识手段，
// 缩略成一个方块的话，玩家在斜视角下分不出住宅和工厂。
export const BUILDING_BOXES = {
  road: [
    { size: [0.98, 0.06, 0.98], color: 0x2b3243 },
    { size: [0.12, 0.07, 0.62], color: 0x6f7a92 },
  ],
  house: [
    { size: [0.6, 0.4, 0.6], at: [0, 0.06, 0], color: 0xe8d9b6 },
    { size: [0.68, 0.16, 0.68], at: [0, 0.46, 0], color: 0xc85a42 },
  ],
  shop: [
    { size: [0.74, 0.52, 0.74], at: [0, 0.06, 0], color: 0x4fa8cc },
    { size: [0.8, 0.08, 0.8], at: [0, 0.58, 0], color: 0xdce8f2 },
    { size: [0.24, 0.14, 0.06], at: [0, 0.34, 0.36], color: 0xffd166 },
  ],
  factory: [
    { size: [0.82, 0.38, 0.82], at: [0, 0.06, 0], color: 0x8a8f9d },
    { size: [0.16, 0.52, 0.16], at: [0.24, 0.44, -0.2], color: 0x646a79 },
    { size: [0.16, 0.34, 0.16], at: [-0.02, 0.44, 0.16], color: 0x646a79 },
  ],
  power: [
    { size: [0.84, 0.26, 0.84], at: [0, 0.06, 0], color: 0x6c7280 },
    { size: [0.26, 0.62, 0.26], at: [-0.2, 0.32, -0.16], color: 0xb3b9c6 },
    { size: [0.26, 0.5, 0.26], at: [0.2, 0.32, 0.16], color: 0xb3b9c6 },
  ],
  park: [
    { size: [0.9, 0.08, 0.9], color: 0x2f7d4f },
    { size: [0.1, 0.2, 0.1], at: [0, 0.08, 0], color: 0x7a5636 },
    { size: [0.4, 0.36, 0.4], at: [0, 0.26, 0], color: 0x54c473 },
  ],
};

// 地形色：草地偏冷绿，林地压深，水面走蓝。
export const TERRAIN_COLORS = {
  [TERRAIN_GRASS]: 0x3f6b4a,
  [TERRAIN_FOREST]: 0x2c5138,
  [TERRAIN_WATER]: 0x1d4e6e,
};

// 林地上的树是纯装饰，用一份共享几何实例化铺开。
export const TREE_BOXES = [
  { size: [0.1, 0.22, 0.1], color: 0x6d4b2f },
  { size: [0.36, 0.34, 0.36], at: [0, 0.2, 0], color: 0x3f9b57 },
];

// 城门标柱：让「路必须连回这里」这条规则在场景里有个实物。
export const GATE_BOXES = [
  { size: [0.14, 0.7, 0.14], at: [-0.34, 0.05, 0], color: 0xffd166 },
  { size: [0.14, 0.7, 0.14], at: [-0.34, 0.05, 0.36], color: 0xffd166 },
];

export const GROUND_HEIGHT = 0.24;
export const WATER_DROP = 0.08;

export const columnToX = (cols, col) => (col - (cols - 1) / 2) * TILE_SPAN;
export const rowToZ = (rows, row) => (row - (rows - 1) / 2) * TILE_SPAN;
export const xToColumn = (cols, x) => Math.round(x / TILE_SPAN + (cols - 1) / 2);
export const zToRow = (rows, z) => Math.round(z / TILE_SPAN + (rows - 1) / 2);
