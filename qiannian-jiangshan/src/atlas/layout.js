// 千年江山图——版面。把「朝代 + 条目」摊成长卷上的坐标，纯函数、确定性，
// 没有 DOM，测试直接吃。表现层只负责照着画。
//
// 三件事在这里定下来：
//
// 1. **轮廓线跨段连续**。三层山峦各自把全卷的控制点串起来再插值一次，
//    而不是一段一段插值——否则段界处会出现折角，长卷就断成了二十一张小画。
// 2. **主峰高度不许被插值放大**。Catmull-Rom 会在控制点之间冲过头，
//    所以插完之后按所在段的上限夹一次；于是「近景层每一段的最高点 === power × scale」
//    仍然成立，「乱世的峰低于两侧盛世」就还是一条可断言的硬规则。
// 3. **标记挂在山脊之上**，按 x 顺序贪心分三行错开。条目的 x 由年份决定、不许挪动
//    （挪了就是在说谎），所以避让只能往上走，用行数换空间。

import { DYNASTIES } from './dynasties.js';
import { buildSegments, scrollWidth, xForYear, yForHeight, segmentAtX, HORIZON, WORLD_H } from './timeline.js';
import { LAYERS, controlsFor, ridgeLine, heightAtX } from './terrain.js';
import { ITEMS } from './query.js';

/** 标记与山脊之间的最小间距。 */
export const MARK_GAP = 30;
/** 错开一行抬多高。 */
export const MARK_ROW = 30;
/** 同一行里两个标记至少隔多远，近于此就换行。 */
export const MARK_MIN_DX = 30;
/**
 * 标记最多错开几行。条目的 x 由年份决定、一步也不能挪，所以避让只能往上叠；
 * 六行是低矮段（江面到卷顶）能容下的极限，再挤不开就该给那一段加 weight。
 */
export const MARK_ROWS = 6;
/** 卷顶留白，标记不越过它。 */
export const TOP_PAD = 34;

/** 一层山峦：控制点 + 插值后的轮廓线。h 已经乘过该层的 scale。 */
function buildLayer(segments, layer, width) {
  const controls = [];
  const ceiling = new Map();
  for (const seg of segments) {
    const top = Math.min(1, seg.power * layer.scale + layer.lift);
    ceiling.set(seg.id, top);
    for (const c of controlsFor(seg, layer.key)) {
      controls.push({ ...c, h: Math.min(top, c.h * layer.scale + layer.lift) });
    }
  }
  const line = ridgeLine(controls).map((p) => {
    const seg = segmentAtX(segments, p.x);
    const top = seg ? ceiling.get(seg.id) : 1;
    return { x: p.x, h: Math.max(0, Math.min(top, p.h)) };
  });
  // 首尾各补一个哨兵：第一个控制点落在留白之内，不补的话卷首卷尾会露出两条没有山的绢。
  if (line.length) {
    if (line[0].x > 0) line.unshift({ x: 0, h: line[0].h });
    const tail = line[line.length - 1];
    if (tail.x < width) line.push({ x: width, h: tail.h });
  }
  return { ...layer, controls, line };
}

/**
 * 给一串条目排标记位置。items 必须已按 x 升序，返回 [{ id, x, y, row, anchorY }]。
 *
 * 两条都要满足才算放得下：**同一行横向拉开** MARK_MIN_DX，以及**与附近已放好的标记
 * 竖向错开** 至少 MARK_CLEAR。后一条不能省：山脊高低不同，锚点也就不同，
 * 光按行号错开时，相邻两行完全可能落到同一个高度上。
 */
const MARK_CLEAR = 20;

function yForRow(anchorY, row) {
  return Math.max(TOP_PAD, anchorY - MARK_GAP - row * MARK_ROW);
}

export function placeMarks(entries) {
  const lastX = new Array(MARK_ROWS).fill(-Infinity);
  const recent = [];
  const clearance = (x, y) => {
    let worst = Infinity;
    for (const p of recent) {
      const d = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
      if (d < worst) worst = d;
    }
    return worst;
  };
  const out = [];
  for (const entry of entries) {
    let row = -1;
    for (let candidate = 0; candidate < MARK_ROWS; candidate += 1) {
      if (entry.x - lastX[candidate] < MARK_MIN_DX) continue;
      if (clearance(entry.x, yForRow(entry.anchorY, candidate)) < MARK_CLEAR) continue;
      row = candidate;
      break;
    }
    // 六行全占满：挑一个离已有标记最远的行硬放，而不是撞在最旧的那行上
    if (row < 0) {
      let best = -Infinity;
      for (let candidate = 0; candidate < MARK_ROWS; candidate += 1) {
        const room = clearance(entry.x, yForRow(entry.anchorY, candidate));
        if (room > best) {
          best = room;
          row = candidate;
        }
      }
    }
    const mark = { ...entry, row, y: yForRow(entry.anchorY, row) };
    lastX[row] = entry.x;
    recent.push(mark);
    if (recent.length > 12) recent.shift();
    out.push(mark);
  }
  return out;
}

/**
 * 整卷版面。
 * 返回 { segments, width, height, horizon, layers, marks, ticks }，
 * marks 与传入的 items 一一对应（顺序按 x 升序）。
 */
export function buildLayout(items = ITEMS, list = DYNASTIES) {
  const segments = buildSegments(list);
  const width = scrollWidth(segments);
  const layers = LAYERS.map((layer) => buildLayer(segments, layer, width));
  const near = layers[layers.length - 1];

  const entries = items
    .map((item) => {
      const x = xForYear(segments, item.year, item.dynasty);
      return { id: item.id, item, x, anchorY: yForHeight(heightAtX(near.line, x)) };
    })
    .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));

  const ticks = segments.map((seg) => ({
    id: seg.id,
    x: seg.x0,
    center: (seg.x0 + seg.x1) / 2,
    year: seg.axisStart,
    name: seg.name,
  }));

  return {
    segments,
    width,
    height: WORLD_H,
    horizon: HORIZON,
    layers,
    marks: placeMarks(entries),
    ticks,
  };
}

/** 卷上某一段的版面信息，按 id 取。 */
export function segmentById(layout, id) {
  return layout.segments.find((s) => s.id === id) ?? null;
}
