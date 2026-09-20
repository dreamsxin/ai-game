// 高程场：把 geo.js 里的控制点插成一张连续的地形，再挖出鄱阳湖、水库和五条大河。
// 纯函数，没有 three 也没有随机数 —— 同样的经纬度永远得到同样的高度，测试因此能逐点比对。
//
// 和沿海省份不同，江西没有海，所以这里不能靠「海平面」统一所有水面。
// 每条河、每个湖都自带水位（geo.js 的 level / pts 第三个数），
// 河道按流向一级级下切：赣州段的水面在 105 米，到吴城入湖只剩 16 米，
// 高差是真的，鱼跃不上去。代价是水面不能用一整张平面糊过去（见 scene/atlasGroup.js 的做法）。
//
// 省界之外照样给地形，但整块压低、颜色调灰（KIND.OUTSIDE），
// 于是江西看起来是一块从邻省托起来的浮雕板 —— 这也是「一眼看出省界在哪」最省事的办法。

import { PROVINCE, LAKES, RIVERS, RELIEF } from './geo.js';
import { LNG_SQUEEZE } from './projection.js';

const fract = (v) => v - Math.floor(v);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

/** 两个八度叠一起：一个定山脊走向，一个加碎石质感 */
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
export function distToPolyline(lng, lat, pts, closed = false) {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ax = a[0] * LNG_SQUEEZE;
    const ay = a[1];
    const vx = b[0] * LNG_SQUEEZE - ax;
    const vy = b[1] - ay;
    const px = lng * LNG_SQUEEZE;
    const len2 = vx * vx + vy * vy || 1e-9;
    const t = clamp(((px - ax) * vx + (lat - ay) * vy) / len2, 0, 1);
    const dx = px - (ax + vx * t);
    const dy = lat - (ay + vy * t);
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  return best;
}

/**
 * 点到某条河的距离，同时把那一段的水面海拔插出来。
 * 水位取自折线点的第三个数，沿段线性插值 —— 河因此在山里是斜着往下走的。
 */
export function riverAt(lng, lat, river) {
  let best = { d: Infinity, level: river.pts[0][2] };
  for (let i = 0; i < river.pts.length - 1; i++) {
    const a = river.pts[i];
    const b = river.pts[i + 1];
    const ax = a[0] * LNG_SQUEEZE;
    const ay = a[1];
    const vx = b[0] * LNG_SQUEEZE - ax;
    const vy = b[1] - ay;
    const px = lng * LNG_SQUEEZE;
    const len2 = vx * vx + vy * vy || 1e-9;
    const t = clamp(((px - ax) * vx + (lat - ay) * vy) / len2, 0, 1);
    const dx = px - (ax + vx * t);
    const dy = lat - (ay + vy * t);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best.d) best = { d, level: a[2] + (b[2] - a[2]) * t };
  }
  return best;
}

/** 椭圆归一化半径：<1 在湖内 */
const ellipseR = (lng, lat, e) => {
  const dx = ((lng - e.lng) * LNG_SQUEEZE) / (e.rx * LNG_SQUEEZE);
  const dy = (lat - e.lat) / e.ry;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * 湖的「归一化半径」：椭圆湖直接算，多边形湖（鄱阳湖）用「在内 / 到岸线的距离」折算成同一个量纲，
 * 这样下面挖湖和过渡岸线的代码对两种湖是同一套。
 */
function lakeR(lng, lat, lake) {
  if (lake.shape !== 'poly') return ellipseR(lng, lat, lake);
  const d = distToPolyline(lng, lat, lake.pts, true);
  const inside = pointInPolygon(lng, lat, lake.pts);
  const span = 0.14; // 岸外这么多度算作过渡带
  return inside ? Math.max(0, 1 - d / span) : 1 + d / span;
}

/** 表现层要按湖形铺水面，所以把「在湖里吗」和湖的经纬度包围盒一起导出去 */
export const lakeContains = (lng, lat, lake, slack = 1) => lakeR(lng, lat, lake) <= slack;

export function lakeBounds(lake) {
  if (lake.shape !== 'poly') {
    return {
      minLng: lake.lng - lake.rx, maxLng: lake.lng + lake.rx,
      minLat: lake.lat - lake.ry, maxLat: lake.lat + lake.ry,
    };
  }
  const lngs = lake.pts.map((p) => p[0]);
  const lats = lake.pts.map((p) => p[1]);
  return {
    minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
  };
}


/**
 * 反距离加权插值。指数取 4 是刻意的：指数低了每个山峰会影响半个省，
 * 赣南会被插成一整块连续高原，吉泰盆地和赣州盆地全被填掉；
 * 指数高了则以控制点为中心出现一个个台地。
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

export const KIND = { OUTSIDE: 0, LAND: 1, LAKE: 2, RIVER: 3 };

/** 河道下切深度（米）。乘上垂直夸张后是一条看得见的槽，水面盖在 level 上 */
const CHANNEL_CUT = 26;
/** 省内陆地的最低高度（米）。鄱阳湖滨最低的圩田大约就是这个量级 */
const LAND_FLOOR = 13;

/**
 * 某点的高程（米）与地物类型。水体额外返回 level（水面海拔），
 * 表现层拿它铺水面，判定层拿它算「景点站在水上还是岸上」。
 */
export function elevationAt(lng, lat) {
  const n = ridged(lng, lat);
  const relief = reliefAt(lng, lat);

  // 省界之外：地形照样起伏（武夷山、南岭不会因为过了省界就消失），
  // 但越往外越平、整体压到一半高，并且不参与配色 —— 表现层会把这一块整块压低、调成灰蓝。
  if (!pointInPolygon(lng, lat, PROVINCE)) {
    const d = distToPolyline(lng, lat, PROVINCE, true);
    const fade = clamp(1 - d / 1.2, 0.22, 1);
    const h = Math.max(15, relief * 0.5 * fade * (0.8 + n * 0.4));
    return { h, kind: KIND.OUTSIDE };
  }

  // 起伏量按当地高度缩放：盆地只做几米的微起伏，山地才给几百米的山脊
  let h = relief * (0.9 + n * 0.2) + (n - 0.5) * Math.min(300, relief * 0.5 + 8);
  h = Math.max(LAND_FLOOR, h);

  // 湖：内部挖到水位以下，外围一圈把地形拉到水位附近，免得湖被一圈崖壁围住
  for (const lake of LAKES) {
    const r = lakeR(lng, lat, lake);
    if (r > 1.5) continue;
    if (r <= 1) {
      // ragged 的湖（水库淹了山谷）用噪声啃岸线，并在湖里留下岛
      if (lake.ragged && noise2(lng * 26, lat * 26) > lake.ragged + (1 - r) * 0.22) {
        h = Math.max(lake.level + 12, Math.min(h, lake.level + 160));
        continue;
      }
      const bowl = Math.cos((r * Math.PI) / 2);
      return { h: lake.level - lake.depth * (0.4 + 0.6 * bowl), kind: KIND.LAKE, level: lake.level };
    }
    const shore = 1 - Math.min(1, (r - 1) / 0.5);
    h = h * (1 - shore) + (lake.level + 6) * shore;
  }

  // 河：中心线切槽，外侧留一段河谷过渡。水位随流向下降，所以槽底也在下降。
  // 河谷这一段只允许「往下切」（取 min）：地形网格的格子比河宽还大，
  // 若允许抬高，河两侧的顶点会盖住画在 level 上的水面缎带，江就时断时续。
  for (const river of RIVERS) {
    const { d, level } = riverAt(lng, lat, river);
    const half = river.width / 2;
    if (d > half * 6) continue;
    if (d < half) return { h: level - CHANNEL_CUT, kind: KIND.RIVER, level };
    const u = (d - half) / (half * 5);
    h = Math.min(h, (level - 1) * (1 - u) + h * u);
  }

  return { h, kind: KIND.LAND };
}


/** 某点的水面海拔（米），不是水就返回 null。表现层用它把景点标记抬到水面之上 */
export function waterLevelAt(lng, lat) {
  const { kind, level } = elevationAt(lng, lat);
  return kind === KIND.LAKE || kind === KIND.RIVER ? level : null;
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
