// 时间轴：向右走必须等于时间向前，这是整张长卷的地基。

import test from 'node:test';
import assert from 'node:assert/strict';
import { DYNASTIES } from '../src/atlas/dynasties.js';
import {
  buildSegments, scrollWidth, xForYear, yearForX, segmentAtX, segmentAtYear, yForHeight,
  WORLD_H, HORIZON, PEAK_SPAN, SEG_PAD,
} from '../src/atlas/timeline.js';

const segments = buildSegments();

test('分段首尾相接，总宽等于最后一段的右界', () => {
  assert.equal(segments.length, DYNASTIES.length);
  assert.equal(segments[0].x0, 0);
  for (let i = 1; i < segments.length; i += 1) {
    assert.equal(segments[i].x0, segments[i - 1].x1, `${segments[i].id} 段界没接上`);
  }
  for (const seg of segments) {
    assert.ok(seg.width > SEG_PAD * 2 + 50, `${seg.id} 太窄，条目会挤在留白上`);
  }
  assert.equal(scrollWidth(segments), segments[segments.length - 1].x1);
});

test('向右走就是时间向前', () => {
  let last = -Infinity;
  for (let x = 0; x <= scrollWidth(segments); x += 20) {
    const year = yearForX(segments, x);
    assert.ok(year >= last, `x=${x} 处年份回退：${year} < ${last}`);
    last = year;
  }
});

test('同一段内年份越晚、横坐标越大', () => {
  for (const seg of segments) {
    const a = xForYear(segments, seg.axisStart, seg.id);
    const b = xForYear(segments, Math.round((seg.axisStart + seg.axisEnd) / 2), seg.id);
    const c = xForYear(segments, seg.axisEnd, seg.id);
    assert.ok(a < b && b < c, `${seg.id} 段内坐标不单调`);
    assert.ok(a >= seg.x0 + SEG_PAD - 1e-9 && c <= seg.x1 - SEG_PAD + 1e-9, `${seg.id} 条目越过了留白`);
  }
});

test('条目自带的朝代优先于年份——重叠的王朝不会被塞错段', () => {
  // 西晋 266 年建国，但轴上 [280,317) 才是它的段；不给 dynasty 就会落进三国
  const bare = segmentAtYear(segments, 270);
  assert.equal(bare.id, 'sanguo');
  const x = xForYear(segments, 270, 'xijin');
  assert.equal(segmentAtX(segments, x).id, 'xijin');
});

test('坐标越界夹到首尾，不抛错', () => {
  assert.equal(segmentAtX(segments, -500).id, segments[0].id);
  assert.equal(segmentAtX(segments, 1e9).id, segments[segments.length - 1].id);
  assert.equal(segmentAtYear(segments, -9999).id, segments[0].id);
  assert.equal(segmentAtYear(segments, 9999).id, segments[segments.length - 1].id);
});

test('高度换算：越高越靠上，江面在 HORIZON', () => {
  assert.equal(yForHeight(0), HORIZON);
  assert.equal(yForHeight(1), HORIZON - PEAK_SPAN);
  assert.ok(yForHeight(1) < yForHeight(0.5));
  assert.ok(yForHeight(1) > 0, '满格峰顶不能顶出卷外');
  assert.ok(HORIZON < WORLD_H, '江面必须留在卷内');
});
