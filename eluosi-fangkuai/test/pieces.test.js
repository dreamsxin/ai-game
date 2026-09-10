import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECE_TYPES,
  kickOffsets,
  normalizeRotation,
  pieceBox,
  pieceCells,
  rotationCount,
  spawnPosition,
} from '../src/game/pieces.js';

test('每种方块的每个朝向都是四格', () => {
  for (const type of PIECE_TYPES) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const cells = pieceCells(type, rotation);
      assert.equal(cells.length, 4, `${type} 朝向 ${rotation} 应有 4 格`);
      const unique = new Set(cells.map(([x, y]) => `${x},${y}`));
      assert.equal(unique.size, 4, `${type} 朝向 ${rotation} 不应有重复格`);
    }
  }
});

test('旋转四次回到原样，O 只有一个朝向', () => {
  for (const type of PIECE_TYPES) {
    assert.deepEqual(pieceCells(type, 4), pieceCells(type, 0));
    assert.deepEqual(pieceCells(type, -1), pieceCells(type, 3));
  }
  assert.equal(rotationCount('O'), 1);
  assert.deepEqual(pieceCells('O', 1), pieceCells('O', 0));
  assert.equal(normalizeRotation('O', 3), 0);
  assert.equal(normalizeRotation('T', -1), 3);
});

test('I 在 4 格盒里旋转，其余在 3 格盒里', () => {
  assert.equal(pieceBox('I'), 4);
  assert.equal(pieceBox('O'), 2);
  for (const type of ['J', 'L', 'S', 'T', 'Z']) assert.equal(pieceBox(type), 3);
  // I 竖直朝向应占同一列的四格。
  const vertical = pieceCells('I', 1);
  assert.equal(new Set(vertical.map(([x]) => x)).size, 1);
});

test('出生位置横向居中，且留在可见区之上', () => {
  for (const type of PIECE_TYPES) {
    const spawn = spawnPosition(type, 10);
    assert.ok(spawn.x >= 0 && spawn.x + pieceBox(type) <= 10, `${type} 出生不应越界`);
    assert.ok(spawn.y < 0, `${type} 出生应在可见区之上`);
  }
});

test('踢墙表每组五个偏移且首个是原地', () => {
  for (const type of ['T', 'I']) {
    for (let from = 0; from < 4; from += 1) {
      for (const to of [normalizeRotation(type, from + 1), normalizeRotation(type, from - 1)]) {
        const offsets = kickOffsets(type, from, to);
        assert.equal(offsets.length, 5, `${type} ${from}->${to} 应有 5 个偏移`);
        assert.deepEqual(offsets[0], [0, 0]);
      }
    }
  }
  assert.deepEqual(kickOffsets('O', 0, 1), [[0, 0]]);
});
