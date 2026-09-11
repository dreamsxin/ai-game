import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/game/random.js';
import { ROAD_NONE, ROAD_TRUNK, roadSpec } from '../src/game/rules.js';
import { generateRoads, roadLength } from '../src/game/roads.js';

const build = (seed, options = {}) => generateRoads(
  createRandom(seed),
  64,
  64,
  { minBlock: 7, ...options },
);

test('同 seed 长出同一张路网', () => {
  const a = build(2024);
  const b = build(2024);
  assert.deepEqual([...a.roads], [...b.roads]);
  assert.deepEqual(a.blocks, b.blocks);
});

test('换 seed 就换一张路网', () => {
  const a = build(1);
  const b = build(2);
  assert.notDeepEqual([...a.roads], [...b.roads]);
});

test('外环把整座城框住，四条边都是主干道', () => {
  const { roads } = build(7);
  const width = roadSpec(ROAD_TRUNK).width;
  for (let col = 0; col < 64; col += 1) {
    assert.equal(roads[col], ROAD_TRUNK, `北边界第 ${col} 格应是主干道`);
    assert.equal(roads[(64 - 1) * 64 + col], ROAD_TRUNK);
  }
  for (let row = 0; row < 64; row += 1) {
    assert.equal(roads[row * 64], ROAD_TRUNK);
    assert.equal(roads[row * 64 + 63], ROAD_TRUNK);
  }
  assert.equal(roads[width * 64 + width] === ROAD_TRUNK, false, '环路只占外圈固定宽度');
});

test('街区互不重叠，也不会压在路上', () => {
  const { roads, blocks } = build(31);
  const seen = new Uint8Array(64 * 64);
  for (const block of blocks) {
    assert.ok(block.cols >= 7 && block.rows >= 7, '街区不小于 minBlock');
    for (let row = block.row; row < block.row + block.rows; row += 1) {
      for (let col = block.col; col < block.col + block.cols; col += 1) {
        const index = row * 64 + col;
        assert.equal(roads[index], ROAD_NONE, `(${col},${row}) 不该既是路又是街区`);
        assert.equal(seen[index], 0, `(${col},${row}) 被两个街区占了`);
        seen[index] = 1;
      }
    }
  }
  assert.ok(blocks.length > 4, `切分应产出多个街区，实际 ${blocks.length}`);
});

test('minBlock 越小街区越多、路网里程越长', () => {
  const coarse = build(9, { minBlock: 12 });
  const fine = build(9, { minBlock: 6 });
  assert.ok(fine.blocks.length > coarse.blocks.length);
  assert.ok(roadLength(fine.roads, 10) > roadLength(coarse.roads, 10));
});

test('街区不会大到占掉半座城：切不下去才收手', () => {
  const { blocks } = build(17, { minBlock: 6 });
  for (const block of blocks) {
    // 还能再塞两个 minBlock 加一条路就说明本该继续切。
    assert.ok(block.cols < 6 * 2 + 1, `街区宽 ${block.cols} 应该再切一刀`);
    assert.ok(block.rows < 6 * 2 + 1, `街区高 ${block.rows} 应该再切一刀`);
  }
});

test('每条道路都记进 segments，供命名使用', () => {
  const { segments } = build(55);
  assert.equal(segments.filter((segment) => segment.ring).length, 4);
  assert.ok(segments.every((segment) => segment.width >= 1 && segment.span > 0));
});
