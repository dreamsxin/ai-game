import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNNER_PARTS,
  VOXEL_SIZE,
  box,
  buildVoxelMesh,
  linearRgb,
  voxelBounds,
} from '../src/scene/voxel.js';

test('a single voxel keeps all six faces', () => {
  const mesh = buildVoxelMesh([{ x: 0, y: 0, z: 0, color: 0xffffff }]);
  assert.equal(mesh.faceCount, 6);
  assert.equal(mesh.positions.length, 6 * 4 * 3);
  assert.equal(mesh.indices.length, 6 * 6);
});

test('touching voxels drop the two hidden faces', () => {
  const mesh = buildVoxelMesh([
    { x: 0, y: 0, z: 0, color: 0xffffff },
    { x: 1, y: 0, z: 0, color: 0xffffff },
  ]);
  assert.equal(mesh.faceCount, 10, `相邻体素应剔除 2 个面，实际生成 ${mesh.faceCount} 个`);
});

test('a solid block only keeps its shell', () => {
  const mesh = buildVoxelMesh(box(0, 0, 0, 3, 3, 3, 0x808080));
  // 3x3x3 里只有正中一个是内部体素，外壳共 26 个方块，可见面 54 个。
  assert.equal(mesh.faceCount, 54);
});

test('later voxels at the same cell win, so detail layers overwrite the base', () => {
  const mesh = buildVoxelMesh([
    { x: 0, y: 0, z: 0, color: 0x000000 },
    { x: 0, y: 0, z: 0, color: 0xffffff },
  ]);
  assert.equal(mesh.faceCount, 6);
  assert.ok(mesh.colors[0] > 0.9, `覆盖后的颜色应为白色，实际 ${mesh.colors[0]}`);
});

test('顶点色转成线性空间，黑白端点保持不变', () => {
  assert.deepEqual(linearRgb(0x000000), [0, 0, 0]);
  assert.deepEqual(linearRgb(0xffffff), [1, 1, 1]);
  const grey = linearRgb(0x808080);
  assert.ok(grey[0] > 0.2 && grey[0] < 0.3, `中灰的线性值应在 0.2~0.3，实际 ${grey[0]}`);
});

test('bounds cover the voxel volume, not just its corners', () => {
  const bounds = voxelBounds(box(-1, 0, 2, 2, 3, 1, 0x123456));
  assert.deepEqual(bounds.min, [-1, 0, 2]);
  assert.deepEqual(bounds.max, [1, 3, 3]);
});

test('the runner is roughly as tall as its collision box', () => {
  const all = Object.values(RUNNER_PARTS).flatMap((part) => part.voxels);
  const bounds = voxelBounds(all);
  const height = (bounds.max[1] - bounds.min[1]) * VOXEL_SIZE;
  assert.ok(height > 1.6 && height < 1.8, `跑者高度 ${height.toFixed(2)} 米，应贴近 1.7`);
});

test('every runner part builds a non-empty mesh around its own pivot', () => {
  for (const [name, part] of Object.entries(RUNNER_PARTS)) {
    const mesh = buildVoxelMesh(part.voxels, { size: VOXEL_SIZE, origin: part.origin });
    assert.ok(mesh.faceCount > 0, `${name} 没有生成任何面`);
    assert.deepEqual(mesh.pivot, part.origin);
  }
});
