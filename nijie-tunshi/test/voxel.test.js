import test from 'node:test';
import assert from 'node:assert/strict';
import { VOXEL_PROFILES, faceBrightness, voxelOccupancy, voxelProfileFor, voxelSurface } from '../src/scene/voxel.js';

test('solid box only emits its six outer faces', () => {
  const resolution = 5;
  const { faceCount } = voxelSurface('box', resolution);
  assert.equal(faceCount, 6 * resolution * resolution, '内部面必须被剔除');
});

test('voxel sphere is blocky, symmetric and strictly inside the unit cube', () => {
  const { cells, size } = voxelOccupancy('sphere', 8);
  const filled = cells.reduce((sum, cell) => sum + cell, 0);
  assert.ok(filled > 0 && filled < size ** 3, '球体应占据部分而非全部单元');

  const at = (ix, iy, iz) => cells[ix + size * (iy + size * iz)];
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        assert.equal(at(ix, iy, iz), at(size - 1 - ix, iy, iz), '球体应左右对称');
        assert.equal(at(ix, iy, iz), at(ix, size - 1 - iy, iz), '球体应上下对称');
      }
    }
  }

  const { positions } = voxelSurface('sphere', 8);
  for (const value of positions) {
    assert.ok(value >= -1 - 1e-6 && value <= 1 + 1e-6, `顶点越界: ${value}`);
  }
});

test('every emitted face carries a unit axis normal', () => {
  const { normals } = voxelSurface('octahedron', 7);
  for (let index = 0; index < normals.length; index += 3) {
    const axis = [normals[index], normals[index + 1], normals[index + 2]];
    const magnitude = Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2]);
    assert.equal(magnitude, 1, `法线必须是单位轴向，实际 ${axis}`);
  }
});

test('surface arrays are triangle aligned and deterministic', () => {
  const left = voxelSurface('cylinder', 8);
  const right = voxelSurface('cylinder', 8);
  assert.equal(left.positions.length % 9, 0, '顶点数应为三角形的整数倍');
  assert.equal(left.positions.length / 3, left.normals.length / 3);
  assert.equal(left.positions.length / 3, left.uvs.length / 2);
  assert.deepEqual(left.positions, right.positions, '同一形状与分辨率必须产生相同网格');
});

test('the prism keeps a triangular footprint rather than a full square', () => {
  const { cells, size } = voxelOccupancy('prism', 8);
  const rowWidth = (iz) => {
    let count = 0;
    for (let ix = 0; ix < size; ix += 1) if (cells[ix + size * (0 + size * iz)]) count += 1;
    return count;
  };
  const front = rowWidth(size - 1);
  const back = rowWidth(0);
  assert.ok(back > front, `三角柱应从后向前收窄，实际 back=${back} front=${front}`);
});

test('every candy type maps to a defined voxel profile', () => {
  for (const type of ['orb', 'cylinder', 'cube', 'prism', 'crystal', 'core']) {
    assert.ok(VOXEL_PROFILES[type], `${type} 缺少体素配置`);
    assert.ok(voxelSurface(VOXEL_PROFILES[type].shape, VOXEL_PROFILES[type].resolution).faceCount > 0);
  }
  assert.equal(voxelProfileFor('unknown'), VOXEL_PROFILES.orb, '未知类型回落到果冻怪');
});

test('unknown shapes fail loudly', () => {
  assert.throws(() => voxelOccupancy('teapot', 6), /未知体素形状/);
});

test('face shading layers by axis so blocks stay readable', () => {
  const top = faceBrightness([0, 1, 0]);
  const bottom = faceBrightness([0, -1, 0]);
  const side = faceBrightness([1, 0, 0]);
  assert.ok(top > side, `顶面应亮于侧面，实际 ${top} vs ${side}`);
  assert.ok(side > bottom, `侧面应亮于底面，实际 ${side} vs ${bottom}`);
  assert.notEqual(faceBrightness([1, 0, 0]), faceBrightness([0, 0, 1]), '前后与左右侧面应可区分');
});

test('baked vertex colors align with vertices and stay in a sane range', () => {
  const { positions, colors } = voxelSurface('sphere', 8);
  assert.equal(colors.length, positions.length, '每个顶点都要有颜色');
  for (const value of colors) {
    assert.ok(value > 0.5 && value <= 1.1, `亮度越界: ${value}`);
  }
  // 同一形状必须逐字节一致，否则回放与截图对比会漂移
  assert.deepEqual(colors, voxelSurface('sphere', 8).colors);
});

test('per cell tint breaks up flat faces without changing geometry', () => {
  const { colors } = voxelSurface('box', 5);
  const unique = new Set(Array.from(colors, (value) => value.toFixed(5)));
  assert.ok(unique.size > 6, `逐单元微差应产生多于 6 种亮度，实际 ${unique.size}`);
});
