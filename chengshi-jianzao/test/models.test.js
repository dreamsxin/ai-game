import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_BOXES,
  buildBoxMesh,
  columnToX,
  linearRgb,
  rowToZ,
  xToColumn,
  zToRow,
} from '../src/scene/models.js';

test('一个盒子焊出 6 个面：24 个顶点、36 个索引', () => {
  const mesh = buildBoxMesh([{ size: [1, 1, 1], color: 0xffffff }]);
  assert.equal(mesh.positions.length, 24 * 3);
  assert.equal(mesh.indices.length, 36);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.colors.length, mesh.positions.length);
});

test('盒子以格子中心为原点、底面贴地', () => {
  const mesh = buildBoxMesh([{ size: [2, 3, 2], color: 0x000000 }]);
  const xs = [];
  const ys = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    xs.push(mesh.positions[i]);
    ys.push(mesh.positions[i + 1]);
  }
  assert.equal(Math.min(...xs), -1);
  assert.equal(Math.max(...xs), 1);
  assert.equal(Math.min(...ys), 0, '底面在 y=0，不会陷进地里');
  assert.equal(Math.max(...ys), 3);
});

test('at 偏移会整体搬动盒子', () => {
  const mesh = buildBoxMesh([{ size: [1, 1, 1], at: [0.5, 0.25, -0.5], color: 0x000000 }]);
  assert.equal(mesh.positions[0], 1, '+X 面被推到 x=1');
  assert.equal(mesh.positions[1], 0.25);
});

test('每种建筑都给得出体块，且不止一块——否则斜视角下认不出来', () => {
  for (const [id, boxes] of Object.entries(BUILDING_BOXES)) {
    assert.ok(boxes.length >= 2, `${id} 只有一个方块`);
    assert.ok(boxes.every((box) => box.size.every((value) => value > 0)), `${id} 有非法尺寸`);
  }
});

test('线性色转换：黑白是定点，中间值被压低', () => {
  assert.deepEqual(linearRgb(0x000000), [0, 0, 0]);
  assert.deepEqual(linearRgb(0xffffff), [1, 1, 1]);
  assert.ok(linearRgb(0x808080)[0] < 0.5);
});

test('格子和世界坐标可以互相换算回去', () => {
  for (const cols of [4, 5, 12]) {
    for (let col = 0; col < cols; col += 1) {
      assert.equal(xToColumn(cols, columnToX(cols, col)), col);
      assert.equal(zToRow(cols, rowToZ(cols, col)), col);
    }
  }
});

test('棋盘是居中的：第一格和最后一格对称', () => {
  assert.equal(columnToX(5, 0), -2);
  assert.equal(columnToX(5, 4), 2);
  assert.equal(columnToX(4, 0), -1.5);
});
