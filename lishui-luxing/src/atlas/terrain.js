// 高程场：把 geo.js 的控制点插成连续地形，再把水库和瓯江切进去。
// 纯函数、无随机数，同一经纬度永远同一结果，测试可以逐点比对。
//
// 和沿海地图最大的不同：丽水没有海，水体各在不同海拔上
// （云和湖 184m、千峡湖 160m、南明湖 50m、瓯江从 190m 一路降到 8m），
// 所以每处水面各自记住自己的 surface 高度，地形按这个高度下切，表现层再按这个高度铺水面。

import { BOUNDARY, RELIEF, LAKES, RIVERS } from './geo.js';
import { LNG_SQUEEZE } from './projection.js';

const fract = (v) => v - Math.floor(v);
const smooth = (t) => t * t * (3 - 2 * t);

function hash2(ix, iy) {
  return fract(Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123);
}

/** 二维 value noise，0..1 */
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

/** 低频定山势走向 */
const swell = (lng, lat) => noise2(lng * 6, lat * 6);
/** 中频给山脊 */
const ridgeMid = (lng, lat) => noise2(lng * 19, lat * 19);
/** 高频给山棱与沟谷 —— 这一档决定"看起来是山"还是"看起来是一团渐变" */
const ridgeFine = (lng, lat) => noise2(lng * 46, lat * 46) * 0.65 + noise2(lng * 95, lat * 95) * 0.35;

export function pointInPolygon(lng, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const dist = (aLng, aLat, bLng, bLat) => {
  const dx = (aLng - bLng) * LNG_SQUEEZE;
  const dy = aLat - bLat;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * 点到带高程折线的最近距离，并带回该处的水面海拔。
 * 河流节点写了各自的水面高度，投影落在哪一段就按段内比例插值。
 */
export function nearestOnRiver(lng, lat, pts) {
  let best = { d: Infinity, surface: 0 };
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
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best.d) best = { d, surface: pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t };
  }
  return best;
}

const ellipseR = (lng, lat, e) => {
  const dx = ((lng - e.lng) * LNG_SQUEEZE) / (e.rx * LNG_SQUEEZE);
  const dy = (lat - e.lat) / e.ry;
  return Math.sqrt(dx * dx + dy * dy);
};

/** 点到市界这条闭合折线的距离（度） */
export function distToBoundary(lng, lat) {
  let best = Infinity;
  for (let i = 0; i < BOUNDARY.length; i++) {
    const a = BOUNDARY[i];
    const b = BOUNDARY[(i + 1) % BOUNDARY.length];
    const ax = a[0] * LNG_SQUEEZE;
    const ay = a[1];
    const bx = b[0] * LNG_SQUEEZE;
    const by = b[1];
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

/**
 * 反距离加权。指数 4 让每个控制点的影响足够局部：
 * 指数低了黄茅尖会把半个丽水拔到一千米以上，河谷全被填平。
 */
function reliefAt(lng, lat) {
  let num = 0;
  let den = 0;
  for (const p of RELIEF) {
    const d = dist(lng, lat, p.lng, p.lat);
    if (d < 0.015) return p.h;
    const w = 1 / Math.pow(d, 4);
    num += w * p.h;
    den += w;
  }
  return num / den;
}

export const KIND = { LAND: 0, LAKE: 1, RIVER: 2 };

/**
 * 某点的高程（米）、地物类型、水面海拔，以及是否在市界内。
 * 界外不裁断而是"退场"：高度随离界距离迅速落到绢底高度，颜色也由表现层洗淡 ——
 * 画卷的主体是丽水，四周该像留白而不是一圈同样高的山。
 */
export function elevationAt(lng, lat) {
  const n = swell(lng, lat);
  const inside = pointInPolygon(lng, lat, BOUNDARY);

  let h = reliefAt(lng, lat);
  // 起伏按当地高度缩放：河谷只做几米浮动，山地叠三档噪声成脊成棱。
  // 高频那一档不能省 —— 只有低频的话，整片山会渲染成一团平滑渐变，完全不像山。
  h *= 0.9 + n * 0.2;
  h += (ridgeMid(lng, lat) - 0.5) * Math.min(330, h * 0.5 + 8);
  h += (ridgeFine(lng, lat) - 0.5) * Math.min(170, h * 0.3 + 4);
  h = Math.max(4, h);

  if (!inside) {
    const fade = Math.max(0, 1 - distToBoundary(lng, lat) / 0.22);
    return { h: Math.max(3, h * fade * fade), kind: KIND.LAND, surface: null, inside: false };
  }

  // 水库：库区内挖到水面以下，库周一圈把地形拉到岸高
  for (const lake of LAKES) {
    const r = ellipseR(lng, lat, lake);
    if (r > 1.4) continue;
    if (r <= 1) {
      // ragged 的库用噪声啃岸线，并在库里留岛 —— 千峡湖、云和湖都是淹出来的峡谷，岸线极碎
      if (lake.ragged && noise2(lng * 34, lat * 34) > lake.ragged + (1 - r) * 0.2) {
        h = Math.max(lake.surface + 12, Math.min(h, lake.surface + 220));
        continue;
      }
      const bowl = 0.35 + 0.65 * Math.cos((r * Math.PI) / 2);
      return { h: lake.surface - lake.depth * bowl, kind: KIND.LAKE, surface: lake.surface, inside };
    }
    const t = 1 - (r - 1) / 0.4;
    h = h * (1 - t) + (lake.surface + 10) * t;
  }

  // 江：中心线切到水面以下，外侧留一段河谷过渡
  for (const river of RIVERS) {
    const { d, surface } = nearestOnRiver(lng, lat, river.pts);
    const half = river.width / 2;
    if (d > half * 6) continue;
    if (d < half) return { h: surface - 3, kind: KIND.RIVER, surface, inside };
    const t = 1 - (d - half) / (half * 5);
    h = h * (1 - t * 0.9) + (surface + 6) * t * 0.9;
  }

  return { h, kind: KIND.LAND, surface: null, inside };
}

/** 采样成网格，给 three 侧造 mesh */
export function buildHeightField(cols, rows, bbox) {
  const heights = new Float32Array(cols * rows);
  const kinds = new Uint8Array(cols * rows);
  const inside = new Uint8Array(cols * rows);
  let maxH = -Infinity;
  let minH = Infinity;
  for (let j = 0; j < rows; j++) {
    const lat = bbox.maxLat - ((bbox.maxLat - bbox.minLat) * j) / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * i) / (cols - 1);
      const s = elevationAt(lng, lat);
      const idx = j * cols + i;
      heights[idx] = s.h;
      kinds[idx] = s.kind;
      inside[idx] = s.inside ? 1 : 0;
      if (s.h > maxH) maxH = s.h;
      if (s.h < minH) minH = s.h;
    }
  }
  return { cols, rows, heights, kinds, inside, maxH, minH };
}
