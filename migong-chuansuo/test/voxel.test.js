import test from 'node:test';
import assert from 'node:assert/strict';
import { DOOR_E, DOOR_N, DOOR_S, DOOR_W, TILE_SPAN, WARP } from '../src/game/rules.js';
import { box, buildVoxelMesh, linearRgb, voxelBounds } from '../src/scene/voxel.js';
import {
  EXIT_VOXELS,
  PALETTE,
  PLAYER_VOXEL,
  PLAYER_VOXELS,
  TILE_ORIGIN,
  TILE_VOXELS,
  VOXEL_SIZE,
  WALL_HEIGHT,
  columnToX,
  rowToZ,
  tileVoxels,
  xToColumn,
  zToRow,
} from '../src/scene/models.js';

test('单个体素保留六个面', () => {
  const mesh = buildVoxelMesh([{ x: 0, y: 0, z: 0, color: 0xffffff }], { shade: false });
  assert.equal(mesh.faceCount, 6);
  assert.equal(mesh.positions.length, 6 * 4 * 3);
  assert.equal(mesh.indices.length, 6 * 6);
});

test('相邻体素剔除两个隐藏面', () => {
  const mesh = buildVoxelMesh([
    { x: 0, y: 0, z: 0, color: 0xffffff },
    { x: 1, y: 0, z: 0, color: 0xffffff },
  ]);
  assert.equal(mesh.faceCount, 10, `相邻体素应剔除 2 个面，实际生成 ${mesh.faceCount} 个`);
});

test('实心块只留外壳', () => {
  const mesh = buildVoxelMesh(box(0, 0, 0, 3, 3, 3, 0x808080));
  // 3x3x3 里只有正中一个是内部体素，可见面 54 个。
  assert.equal(mesh.faceCount, 54);
});

test('同坐标后写入的体素覆盖前者，细节层能盖在基础块上', () => {
  const mesh = buildVoxelMesh([
    { x: 0, y: 0, z: 0, color: 0x000000 },
    { x: 0, y: 0, z: 0, color: 0xffffff },
  ], { shade: false });
  assert.equal(mesh.faceCount, 6);
  assert.ok(mesh.colors[0] > 0.9, `覆盖后的颜色应为白色，实际 ${mesh.colors[0]}`);
});

test('顶点色转成线性空间，黑白端点保持不变', () => {
  assert.deepEqual(linearRgb(0x000000), [0, 0, 0]);
  assert.deepEqual(linearRgb(0xffffff), [1, 1, 1]);
  const grey = linearRgb(0x808080);
  assert.ok(grey[0] > 0.2 && grey[0] < 0.3, `中灰的线性值应在 0.2~0.3，实际 ${grey[0]}`);
});

test('烘进去的朝向明暗让顶面比底面亮', () => {
  const mesh = buildVoxelMesh([{ x: 0, y: 0, z: 0, color: 0xffffff }]);
  const channels = [];
  for (let index = 0; index < mesh.colors.length; index += 12) channels.push(mesh.colors[index]);
  assert.equal(Math.max(...channels), 1, '应该有一个面保持原色');
  assert.ok(Math.min(...channels) < 0.7, '底面应该被压暗');
});

test('包围盒覆盖体素体积而不是只有角点', () => {
  const bounds = voxelBounds(box(-1, 0, 2, 2, 3, 1, 0x123456));
  assert.deepEqual(bounds.min, [-1, 0, 2]);
  assert.deepEqual(bounds.max, [1, 3, 3]);
});

test('砖体正好铺满一格减去缝隙', () => {
  assert.ok(Math.abs(TILE_VOXELS * VOXEL_SIZE - 0.9) < 1e-9);
  assert.ok(TILE_VOXELS * VOXEL_SIZE < TILE_SPAN, '砖必须比格子小，否则看不出滑动');
});

test('四面全墙的砖比四面全门的砖体素更多', () => {
  const sealed = tileVoxels(0).length;
  const open = tileVoxels(DOOR_N | DOOR_E | DOOR_S | DOOR_W).length;
  assert.ok(open < sealed, `开门应该挖掉体素，实际 ${open} vs ${sealed}`);
  // 每边挖掉 3 格宽、WALL_HEIGHT 高。
  assert.equal(sealed - open, 4 * 3 * WALL_HEIGHT);
});

test('开门的那一边确实在门洞位置没有墙体', () => {
  const voxels = tileVoxels(DOOR_N);
  const gap = voxels.filter((voxel) => voxel.z === 0 && voxel.x === 4 && voxel.y > 0);
  assert.equal(gap.length, 0, '北侧门洞正中不该有墙');
  const wall = voxels.filter((voxel) => voxel.z === TILE_VOXELS - 1 && voxel.x === 4 && voxel.y > 0);
  assert.equal(wall.length, WALL_HEIGHT, '南侧没门就该是整堵墙');
});

test('每块砖都补齐四角立柱，开门也不缺角', () => {
  const last = TILE_VOXELS - 1;
  for (const tile of [0, DOOR_N | DOOR_W, DOOR_N | DOOR_E | DOOR_S | DOOR_W]) {
    const voxels = tileVoxels(tile);
    for (const [x, z] of [[0, 0], [last, 0], [0, last], [last, last]]) {
      // 角上的体素会被两面墙和立柱各写一次，mesher 靠后写入覆盖去重，所以这里数层数。
      const levels = new Set(
        voxels.filter((voxel) => voxel.x === x && voxel.z === z && voxel.y > 0).map((voxel) => voxel.y),
      );
      assert.equal(levels.size, WALL_HEIGHT, `tile ${tile} 在 (${x},${z}) 缺立柱`);
    }
  }
});

test('跃迁垫只在带 WARP 位的砖上出现，垫心颜色最后写入', () => {
  const plain = tileVoxels(DOOR_N);
  const warp = tileVoxels(DOOR_N | WARP);
  assert.ok(warp.length > plain.length);
  const centre = warp.filter((voxel) => voxel.y === 1 && voxel.x === 4 && voxel.z === 4);
  assert.ok(centre.length >= 1, '跃迁垫正中应该有体素');
  assert.equal(centre.at(-1).color, PALETTE.warpCore, '最后写入的应该是垫心的亮色');
  assert.equal(plain.filter((voxel) => voxel.y === 1 && voxel.x === 4 && voxel.z === 4).length, 0);
});

test('每块砖都能烘出非空网格，且枢轴落在砖心', () => {
  for (const tile of [0, 1, 5, 15, 16, 31]) {
    const mesh = buildVoxelMesh(tileVoxels(tile), { size: VOXEL_SIZE, origin: TILE_ORIGIN });
    assert.ok(mesh.faceCount > 0, `tile ${tile} 没有生成任何面`);
    assert.deepEqual(mesh.pivot, TILE_ORIGIN);
  }
});

test('角色高度压在墙高之下，不然会从房间里冒出来', () => {
  const bounds = voxelBounds(PLAYER_VOXELS);
  const height = (bounds.max[1] - bounds.min[1]) * PLAYER_VOXEL;
  const wall = WALL_HEIGHT * VOXEL_SIZE;
  assert.ok(height < wall, `角色高 ${height.toFixed(3)}，墙只有 ${wall.toFixed(3)}`);
  assert.ok(height > wall * 0.5, `角色高 ${height.toFixed(3)}，太矮会看不见`);
});

test('出口门拱是个非空模型', () => {
  const mesh = buildVoxelMesh(EXIT_VOXELS);
  assert.ok(mesh.faceCount > 0);
});

test('格子和世界坐标能来回换算', () => {
  for (const cols of [3, 4, 5]) {
    for (let col = 0; col < cols; col += 1) {
      assert.equal(xToColumn(cols, columnToX(cols, col)), col);
    }
  }
  for (const rows of [3, 4, 5]) {
    for (let row = 0; row < rows; row += 1) {
      assert.equal(zToRow(rows, rowToZ(rows, row)), row);
    }
  }
});

test('棋盘以原点居中，首末格对称', () => {
  assert.equal(columnToX(4, 0), -columnToX(4, 3));
  assert.equal(rowToZ(5, 0), -rowToZ(5, 4));
  assert.equal(columnToX(5, 2), 0);
});
