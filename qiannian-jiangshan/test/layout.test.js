// 版面：条目的位置不许说谎（x 由年份决定），避让只能往上抬。

import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/atlas/query.js';
import { buildLayout, placeMarks, segmentById, MARK_GAP, MARK_MIN_DX, MARK_ROW, TOP_PAD } from '../src/atlas/layout.js';
import { heightAtX } from '../src/atlas/terrain.js';
import { yForHeight } from '../src/atlas/timeline.js';

const layout = buildLayout();

test('每条条目都在卷上有一个标记，按 x 升序', () => {
  assert.equal(layout.marks.length, ITEMS.length);
  assert.deepEqual(
    new Set(layout.marks.map((m) => m.id)).size,
    ITEMS.length,
  );
  for (let i = 1; i < layout.marks.length; i += 1) {
    assert.ok(layout.marks[i].x >= layout.marks[i - 1].x, '标记没有按卷面顺序排');
  }
});

test('标记落在自己朝代那一段里', () => {
  for (const m of layout.marks) {
    const seg = segmentById(layout, m.item.dynasty);
    assert.ok(seg, `${m.id} 的朝代 ${m.item.dynasty} 不在卷上`);
    assert.ok(m.x >= seg.x0 && m.x <= seg.x1, `${m.id} 跑出了 ${seg.id} 段`);
  }
});

test('标记挂在山脊之上，不会埋进山里', () => {
  const near = layout.layers[layout.layers.length - 1];
  for (const m of layout.marks) {
    const ridgeY = yForHeight(heightAtX(near.line, m.x));
    assert.ok(Math.abs(m.anchorY - ridgeY) < 1e-9, `${m.id} 的锚点不在山脊上`);
    assert.ok(m.y <= m.anchorY - MARK_GAP + 1e-9, `${m.id} 压在山脊上：y=${m.y} anchor=${m.anchorY}`);
    assert.ok(m.y >= TOP_PAD - 1e-9, `${m.id} 冲出卷顶`);
  }
});

test('标记互不遮挡：同行拉得开，靠得近的必然错在不同高度', () => {
  const rows = new Map();
  for (const m of layout.marks) {
    if (!rows.has(m.row)) rows.set(m.row, []);
    rows.get(m.row).push(m);
  }
  let tight = 0;
  for (const [row, list] of rows) {
    for (let i = 1; i < list.length; i += 1) {
      const dx = list[i].x - list[i - 1].x;
      // 标记半径 6 + 光晕 3.5，同一行的两个圆心隔 20 以上就不会互相压住
      assert.ok(dx >= 20, `第 ${row} 行 ${list[i - 1].id}→${list[i].id} 只隔了 ${dx.toFixed(1)}`);
      if (dx < MARK_MIN_DX) tight += 1;
    }
  }
  // 挤不开的密集处允许存在但必须是少数；多了就说明该给那一段加 weight
  assert.ok(tight <= 3, `有 ${tight} 处同行间距不足 ${MARK_MIN_DX}，该段卷面需要加宽`);

  // 跨行也要查一遍：y 被卷顶夹住时，两行可能落到同一高度
  const marks = layout.marks;
  for (let i = 0; i < marks.length; i += 1) {
    for (let k = i + 1; k < marks.length; k += 1) {
      const dx = marks[k].x - marks[i].x;
      if (dx >= 20) break;
      const dy = Math.abs(marks[k].y - marks[i].y);
      assert.ok(dy >= 18, `${marks[i].id} 与 ${marks[k].id} 叠在一起：dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
    }
  }
});

test('挤不开才换行：稀疏的条目全留在第 0 行', () => {
  const marks = placeMarks([
    { id: 'a', x: 0, anchorY: 500 },
    { id: 'b', x: MARK_MIN_DX + 1, anchorY: 500 },
    { id: 'c', x: (MARK_MIN_DX + 1) * 2, anchorY: 500 },
  ]);
  assert.deepEqual(marks.map((m) => m.row), [0, 0, 0]);
  assert.deepEqual(marks.map((m) => m.y), [500 - MARK_GAP, 500 - MARK_GAP, 500 - MARK_GAP]);

  const packed = placeMarks([
    { id: 'a', x: 0, anchorY: 500 },
    { id: 'b', x: 2, anchorY: 500 },
    { id: 'c', x: 4, anchorY: 500 },
  ]);
  assert.deepEqual(packed.map((m) => m.row), [0, 1, 2]);
  assert.equal(packed[2].y, 500 - MARK_GAP - 2 * MARK_ROW);
});

test('近景层每一段的最高点仍然等于 power——插值不许把峰冲高', () => {
  const near = layout.layers[layout.layers.length - 1];
  for (const seg of layout.segments) {
    const inside = near.line.filter((p) => p.x >= seg.x0 && p.x < seg.x1);
    assert.ok(inside.length > 10, `${seg.id} 段内轮廓点太少`);
    const top = Math.max(...inside.map((p) => p.h));
    assert.ok(top <= seg.power + 1e-9, `${seg.id} 被插值冲高到 ${top}`);
    assert.ok(top > seg.power * 0.9, `${seg.id} 的主峰没画出来，只到 ${top}`);
  }
});

test('三层山峦从卷首铺到卷尾，远层不超过自己的上限', () => {
  for (const layer of layout.layers) {
    assert.equal(layer.line[0].x, 0, `${layer.key} 层卷首露白`);
    assert.equal(layer.line[layer.line.length - 1].x, layout.width, `${layer.key} 层卷尾露白`);
    for (const seg of layout.segments) {
      const ceiling = Math.min(1, seg.power * layer.scale + layer.lift);
      for (const p of layer.line.filter((q) => q.x >= seg.x0 && q.x < seg.x1)) {
        assert.ok(p.h <= ceiling + 1e-9, `${layer.key}/${seg.id} 超出上限`);
      }
    }
  }
});

test('题签刻度与分段一一对应', () => {
  assert.equal(layout.ticks.length, layout.segments.length);
  layout.ticks.forEach((tick, i) => {
    assert.equal(tick.id, layout.segments[i].id);
    assert.equal(tick.year, layout.segments[i].axisStart);
    assert.ok(tick.center > tick.x);
  });
});
