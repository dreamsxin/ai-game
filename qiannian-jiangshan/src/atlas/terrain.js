// 千年江山图——山峦生成。纯函数、确定性（同一个朝代表永远画出同一座山），
// 没有 DOM，测试直接吃。
//
// 两件事值得先说清楚：
//
// 1. **山高就是国力。** 每一段的主峰高度**精确等于** dynasties.js 里的 power，
//    噪声只往下削、从不往上加。于是「乱世的峰一定低于它两侧的盛世」变成一条
//    可以断言的硬规则，而不是看图说话。
// 2. **只有低频噪声的地形会渲染成一团平滑渐变。** 所以控制点分三级：
//    主峰 / 次峰 / 谷口，再用 Catmull-Rom 过一遍——山才有起伏，而不是一条缓坡。
//
// 分裂割据的段（春秋、战国、三国、东晋十六国、南北朝、五代十国）谷口压得更低，
// 低到江面附近：卷上看过去就是「山断成几截，中间是水与云」。

import { PEAK_SPAN, HORIZON, SEG_PAD } from './timeline.js';

/** 三层远近：远山淡入绢底，近山是主角。index 越大越近。 */
export const LAYERS = [
  { key: 'far', scale: 0.52, depth: 0.78, parallax: 0.55, lift: 0.1 },
  { key: 'mid', scale: 0.78, depth: 0.42, parallax: 0.78, lift: 0.04 },
  { key: 'near', scale: 1, depth: 0.06, parallax: 1, lift: 0 },
];

/** 确定性哈希：整数 → 0..1。同一个 seed 永远同一个数。 */
export function hash01(seed) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 字符串 → 整数种子，用来让每个朝代有自己固定的一座山。 */
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
/**
 * 为一段生成控制点（还没有乘层缩放）。返回 [{ x, h, role }]，
 * role 是 'peak' 主峰 / 'sub' 次峰 / 'saddle' 谷口 / 'gate' 段界。
 *
 * 主峰的 h 就是 power 本身，一个字都不打折——这是整个模块的锚。
 */
export function controlsFor(seg, layerKey = 'near') {
  const seed = seedOf(`${seg.id}:${layerKey}`);
  const count = Math.max(3, Math.min(8, Math.round(seg.width / 165)));
  const inner = seg.width - SEG_PAD * 2;
  const mainIndex = Math.floor(hash01(seed + 101) * count);
  const divided = seg.kind === 'divided';
  // 盛世的谷口只下切到半山，峰与峰因此连成山脉；乱世才把谷口压到江面附近，
  // 山断成几截。谷口挖太深的话，每座峰都成了孤零零的针，不像青绿山水里的山。
  const valleyFloor = divided ? 0.06 : 0.44;
  const valleyRange = divided ? 0.14 : 0.16;

  const points = [];
  for (let i = 0; i < count; i += 1) {
    // 峰位在自己那一格里抖动，避免等距排列看起来像锯齿
    const slot = (i + 0.5) / count;
    const jitter = (hash01(seed + i * 31 + 7) - 0.5) * (0.7 / count);
    const x = seg.x0 + SEG_PAD + (slot + jitter) * inner;
    const isMain = i === mainIndex;
    const h = isMain
      ? seg.power
      : seg.power * (0.36 + 0.44 * hash01(seed + i * 53 + 13));
    points.push({ x, h, role: isMain ? 'peak' : 'sub', segId: seg.id });
  }

  // 主峰两侧各加一道肩。只给一个尖点的话，Catmull-Rom 会把主峰画成一根针，
  // 而青绿山水里的主峰是一整片山体——肩与峰之间不挖谷口。
  const shouldered = [];
  const shoulderDx = (inner / count) * 0.4;
  for (const point of points) {
    if (point.role !== 'peak') {
      shouldered.push(point);
      continue;
    }
    const h = seg.power * (divided ? 0.6 : 0.74);
    shouldered.push({ x: point.x - shoulderDx, h, role: 'shoulder', segId: seg.id });
    shouldered.push(point);
    shouldered.push({ x: point.x + shoulderDx, h, role: 'shoulder', segId: seg.id });
  }

  // 峰与峰之间挖谷口。谷口比两侧低，乱世低到贴着江面。
  const withValleys = [];
  for (let i = 0; i < shouldered.length; i += 1) {
    const b = shouldered[i];
    if (i > 0) {
      const a = shouldered[i - 1];
      // 肩与它自己的主峰之间不挖谷口；肩与旁边的次峰之间照挖
      const ownShoulder = (a.role === 'shoulder' && b.role === 'peak') || (a.role === 'peak' && b.role === 'shoulder');
      if (!ownShoulder) {
        const floor = Math.min(a.h, b.h);
        withValleys.push({
          x: (a.x + b.x) / 2,
          h: floor * (valleyFloor + valleyRange * hash01(seed + i * 97 + 41)),
          role: 'saddle',
          segId: seg.id,
        });
      }
    }
    withValleys.push(b);
  }
  return withValleys.sort((a, b) => a.x - b.x);
}
/**
 * 密采控制点 → 平滑的轮廓线（不含段界外的哨兵），
 * 用 Catmull-Rom 逐段插值，每一像素步长 STEP。
 *
 * 返回 [{ x, h }]，h 是 0..1 的相对高度。
 * 多层的话，调用方在外面乘 layer.scale 即可。
 */
const STEP = 4;

export function ridgeLine(controls) {
  const n = controls.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: controls[0].x, h: controls[0].h }];

  const result = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(n - 1, i + 2)];
    const dx = p2.x - p1.x;
    const steps = Math.max(1, Math.ceil(dx / STEP));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const x = p1.x + dx * t;
      const h = Math.max(0, catmull(p0.h, p1.h, p2.h, p3.h, t));
      result.push({ x, h });
    }
  }
  const last = controls[n - 1];
  result.push({ x: last.x, h: Math.max(0, last.h) });
  return result;
}

/**
 * 在轮廓线上查高度。x 越界就返回 0（江面以下）。
 * 用二分查找加线性插值，比遍历快。
 */
export function heightAtX(line, x) {
  if (!line.length) return 0;
  if (x <= line[0].x) return line[0].h;
  if (x >= line[line.length - 1].x) return line[line.length - 1].h;
  let lo = 0;
  let hi = line.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (line[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = line[lo];
  const b = line[hi];
  const t = (x - a.x) / (b.x - a.x || 1);
  return a.h + (b.h - a.h) * t;
}

