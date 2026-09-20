// 高程场：把 geo.js 里的控制点插成一张连续的地形，并挖出海、湖和江。
// 纯函数，没有 three 也没有随机数 —— 同样的经纬度永远得到同样的高度，测试因此能逐点比对。
//
// 两处刻意的简化，都是为了让全场只用一张海平面水面就能表现所有水体：
//   1. 湖（千岛湖、西湖）挖到海平面以下，湖周一圈地形平滑降到岸高，不做真实的湖面海拔；
//   2. 江沿中心线切一条窄槽到海平面以下，外侧留一段更宽的河谷过渡。
// 代价是「千岛湖其实在海拔 100 米上」这件事在图上看不出来，换来的是水面连续、没有接缝。

import { PROVINCE, ISLANDS, LAKES, RIVERS, RELIEF } from './geo.js';
import { LNG_SQUEEZE } from './projection.js';

const fract = (v) => v - Math.floor(v);
const smooth = (t) => t * t * (3 - 2 * t);

/** 确定性 hash：同一个格点永远同一个值，不用 Math.random */
function hash2(ix, iy) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return fract(s);
}

/** 二维 value noise，返回 0..1 */
export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** 两个八度叠一起，够用了：一个octave 定山脊走向，一个加碎石质感 */
const ridged = (lng, lat) => noise2(lng * 6.5, lat * 6.5) * 0.7 + noise2(lng * 17, lat * 17) * 0.3;

/** 射线法判断点在多边形内 */
export function pointInPolygon(lng, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 经纬度距离（度，已按中心纬度收窄经度），用于河宽和影响半径 */
const dist = (aLng, aLat, bLng, bLat) => {
  const dx = (aLng - bLng) * LNG_SQUEEZE;
  const dy = aLat - bLat;
  return Math.sqrt(dx * dx + dy * dy);
};

/** 点到折线的最近距离（度） */
export function distToPolyline(lng, lat, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0] * LNG_SQUEEZE;
    const ay = pts[i][1];
    const bx = pts[i + 1][0] * LNG_SQUEEZE;
    const by = pts[i + 1][1];
    const px = lng * LNG_SQUEEZE;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy || 1e-9;
    let t = ((px - ax) * vx + (lat - ay) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const dx = px - (ax + vx * t);
    const dy = lat - (ay + vy * t);
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  return best;
}

/** 椭圆归一化半径：<1 在岛/湖内 */
const ellipseR = (lng, lat, e) => {
  const dx = ((lng - e.lng) * LNG_SQUEEZE) / (e.rx * LNG_SQUEEZE);
  const dy = (lat - e.lat) / e.ry;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * 反距离加权插值。指数取 4 是刻意的：指数低了每个山峰会影响半个省，
 * 浙南会被插成一整块连续高原，山谷全被填掉；指数高了则以控制点为中心出现台地。
 */
function reliefAt(lng, lat) {
  let num = 0;
  let den = 0;
  for (const p of RELIEF) {
    const d = dist(lng, lat, p.lng, p.lat);
    if (d < 0.02) return p.h;
    const w = 1 / Math.pow(d, 4);
    num += w * p.h;
    den += w;
  }
  return num / den;
}

export const KIND = { SEA: 0, LAND: 1, LAKE: 2, RIVER: 3 };

/**
 * 某点的高程（米，负数是水下）和地物类型。
 * 岛屿即使落在省界外也算陆地 —— 舟山群岛全在省界多边形之外。
 */
export function elevationAt(lng, lat) {
  const n = ridged(lng, lat);

  // 海岛：椭圆内按距边缘的远近抬起来
  let island = null;
  for (const e of ISLANDS) {
    const r = ellipseR(lng, lat, e);
    const edge = 1 + (n - 0.5) * 0.28; // 噪声让岛的轮廓不那么规整
    if (r < edge) {
      const h = e.h * Math.pow(1 - r / edge, 0.75) * (0.65 + n * 0.5) + 6;
      if (!island || h > island.h) island = { h, kind: KIND.LAND };
    }
  }
  if (island) return island;

  if (!pointInPolygon(lng, lat, PROVINCE)) {
    // 省界外：近岸浅、远海深，浅滩起伏靠噪声
    return { h: -18 - n * 26, kind: KIND.SEA };
  }

  let h = reliefAt(lng, lat);
  // 起伏量按当地高度缩放：平原只做几米的微起伏，山地才给几百米的山脊
  h = h * (0.9 + n * 0.2) + (n - 0.5) * Math.min(260, h * 0.5 + 8);
  h = Math.max(3, h);

  // 湖：内部挖到海平面下，外围一圈把地形拉到岸高，免得湖在山里被一圈崖壁围住
  for (const lake of LAKES) {
    const r = ellipseR(lng, lat, lake);
    if (r > 1.45) continue;
    const shoreBlend = 1 - Math.min(1, (r - 1) / 0.45);
    if (r <= 1) {
      // ragged 的湖用噪声啃岸线，并在湖里留下岛
      if (lake.ragged && noise2(lng * 26, lat * 26) > lake.ragged + (1 - r) * 0.22) {
        h = Math.min(h, 90) * 0.35 + 18;
        continue;
      }
      const deep = -lake.depth * (0.45 + 0.55 * Math.cos((r * Math.PI) / 2));
      return { h: deep, kind: KIND.LAKE };
    }
    h = h * (1 - shoreBlend) + 8 * shoreBlend;
  }

  // 江：中心线切槽，外侧河谷过渡
  for (const river of RIVERS) {
    const d = distToPolyline(lng, lat, river.pts);
    const half = river.width / 2;
    if (d > half * 5) continue;
    if (d < half) return { h: -5 - (1 - d / half) * 4, kind: KIND.RIVER };
    const t = 1 - (d - half) / (half * 4);
    h = h * (1 - t * 0.92) + 4 * t * 0.92;
  }

  return { h, kind: KIND.LAND };
}

/** 采样成网格，给 three 侧造 mesh 用。cols/rows 是顶点数 */
export function buildHeightField(cols, rows, bbox) {
  const heights = new Float32Array(cols * rows);
  const kinds = new Uint8Array(cols * rows);
  let maxH = -Infinity;
  let minH = Infinity;
  for (let j = 0; j < rows; j++) {
    const lat = bbox.maxLat - ((bbox.maxLat - bbox.minLat) * j) / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * i) / (cols - 1);
      const { h, kind } = elevationAt(lng, lat);
      const idx = j * cols + i;
      heights[idx] = h;
      kinds[idx] = kind;
      if (h > maxH) maxH = h;
      if (h < minH) minH = h;
    }
  }
  return { cols, rows, heights, kinds, maxH, minH };
}
