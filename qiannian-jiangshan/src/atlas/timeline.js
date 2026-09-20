// 千年江山图——时间轴。把「年」换成长卷上的横坐标，纯函数，测试直接吃。
//
// 横轴不是等比例的：五千年里前一半只留下很少的条目，明清两朝却密得挤不开。
// 所以轴按朝代**分段线性**：每段自己占一块卷面（宽度由时长的 0.45 次方和手调
// weight 共同决定），段内再线性插值。段与段首尾严格相接，于是「向右走」永远等于
// 「时间向前」——这一条有测试守着。
//
// 世界坐标：y 向下为正，卷高固定 WORLD_H；实际显示时整卷按视口高度缩放。

import { DYNASTIES } from './dynasties.js';

export const WORLD_H = 1000;
/** 地平线：山脚与江面的交界。江水从这里一直铺到卷底。 */
export const HORIZON = WORLD_H * 0.84;
/** 峰高满格（power = 1）时能顶到的高度，从 HORIZON 往上量。 */
export const PEAK_SPAN = WORLD_H * 0.7;
/** 每段左右各留的空白，避免条目贴在段界上。 */
export const SEG_PAD = 58;

const SEG_BASE = 440;
const SEG_K = 34;

/**
 * 算出每一段在卷上的位置。返回的数组与 DYNASTIES 一一对应，
 * 多出来的字段：x0 / x1 / width / years（轴上时长）。
 */
export function buildSegments(list = DYNASTIES) {
  const segments = [];
  let cursor = 0;
  for (const d of list) {
    const years = d.axisEnd - d.axisStart;
    const width = Math.round(d.weight * (SEG_BASE + Math.pow(years, 0.45) * SEG_K));
    segments.push({ ...d, years, x0: cursor, x1: cursor + width, width });
    cursor += width;
  }
  return segments;
}

/** 整卷总宽。 */
export function scrollWidth(segments) {
  return segments.length ? segments[segments.length - 1].x1 : 0;
}

/**
 * 年份 → 横坐标。
 * 条目自带 dynasty，所以优先按它指定的那一段定位（历史上王朝会重叠，
 * 光看年份会把西晋的事塞进三国段里）。年份越界就夹到该段的留白内侧。
 */
export function xForYear(segments, year, dynastyId) {
  const seg = (dynastyId && segments.find((s) => s.id === dynastyId)) || segmentAtYear(segments, year);
  if (!seg) return 0;
  const span = seg.axisEnd - seg.axisStart || 1;
  const t = Math.max(0, Math.min(1, (year - seg.axisStart) / span));
  return seg.x0 + SEG_PAD + t * (seg.width - SEG_PAD * 2);
}

/** 横坐标 → 落在哪一段。卷外的坐标夹到首尾两段。 */
export function segmentAtX(segments, x) {
  if (!segments.length) return null;
  if (x <= segments[0].x0) return segments[0];
  const last = segments[segments.length - 1];
  if (x >= last.x1) return last;
  return segments.find((s) => x >= s.x0 && x < s.x1) ?? last;
}

/** 公元年 → 落在哪一段（不考虑条目自带的 dynasty）。 */
export function segmentAtYear(segments, year) {
  if (!segments.length) return null;
  if (year <= segments[0].axisStart) return segments[0];
  const last = segments[segments.length - 1];
  if (year >= last.axisEnd) return last;
  return segments.find((s) => year >= s.axisStart && year < s.axisEnd) ?? last;
}

/** 横坐标 → 大致年份，用于卷上的刻度文字。 */
export function yearForX(segments, x) {
  const seg = segmentAtX(segments, x);
  if (!seg) return 0;
  const inner = Math.max(1, seg.width - SEG_PAD * 2);
  const t = Math.max(0, Math.min(1, (x - seg.x0 - SEG_PAD) / inner));
  return Math.round(seg.axisStart + t * (seg.axisEnd - seg.axisStart));
}

/** 相对高度（0..1）→ 世界 y。 */
export function yForHeight(h) {
  return HORIZON - h * PEAK_SPAN;
}
