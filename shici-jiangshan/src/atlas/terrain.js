// 高程场：把 geo.js 的控制点插成连续地形，再把大湖和大江切进去。
// 纯函数、无随机数，同一经纬度永远同一结果，测试可以逐点比对。
//
// 全国尺度上和省域图的三点不同：
// 1. 「多边形之外」就是海，所以要给海一条按离岸距离下沉的深度曲线，
//    否则海岸只是一道色界，低角度看过去是一张纸。
// 2. 水体各在不同海拔上（长江从四千米落到零、青海湖 3194 米、太湖 3 米），
//    所以每处水面各自记住 surface，地形按它下切，表现层再按它铺水面。
// 3. 反距离加权的指数不能太高：全国控制点间距上千公里，指数给到 4 会出现一个个
//    同心圆"牛眼"，中原平原上尤其明显。这里用 3，再靠三档噪声补细节。

import { LAND, ISLANDS, RELIEF, LAKES, RIVERS } from './geo.js';
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

/**
 * 三档噪声的频率都压在采样频率之下。网格一格约 0.09 度，
 * 也就是每度只能分辨五六个周期；第一版给到 18 和 38，全图立刻变成一张
 * 均匀的皱纸 —— 那不是山，是走样。所有频率都留在 4 周期／度以内之后，
 * 起伏才重新成为"一条条山脉"。
 */
const swell = (lng, lat) => noise2(lng * 1.2, lat * 1.2);
const ridgeMid = (lng, lat) => noise2(lng * 2.6, lat * 2.6);
const ridgeFine = (lng, lat) => noise2(lng * 4.2, lat * 4.2) * 0.62 + noise2(lng * 5.2, lat * 5.2) * 0.38;


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

/** 点到带高程折线的最近距离，并带回该处的水面海拔 */
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

/** 点到某条闭合折线的距离（度） */
function distToRing(lng, lat, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
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

/** 离最近海岸有多远（度）。海里取陆地外圈与各岛的最小值 */
export function distToCoast(lng, lat) {
  let best = distToRing(lng, lat, LAND);
  for (const isle of ISLANDS) best = Math.min(best, distToRing(lng, lat, isle.ring));
  return best;
}

/**
 * 反距离加权。指数 3 是全国尺度上试出来的折中：
 * 再高就会在每个控制点周围出现同心圆，再低则秦岭、太行这些窄山脉会被摊平。
 * 九度以外的点权重已在千分之一以下，直接跳过省掉大半开销。
 */
function reliefAt(lng, lat) {
  let num = 0;
  let den = 0;
  for (const p of RELIEF) {
    const d = dist(lng, lat, p.lng, p.lat);
    if (d < 0.05) return p.h;
    if (d > 9) continue;
    const w = 1 / (d * d * d);
    num += w * p.h;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export const KIND = { LAND: 0, LAKE: 1, RIVER: 2, SEA: 3 };

export function isLand(lng, lat) {
  if (pointInPolygon(lng, lat, LAND)) return true;
  for (const isle of ISLANDS) if (pointInPolygon(lng, lat, isle.ring)) return true;
  return false;
}

/** 某点的高程（米）、地物类型与水面海拔 */
export function elevationAt(lng, lat) {
  if (!isLand(lng, lat)) {
    // 海：近岸浅、离岸深。0.7 次幂让大陆架有一段缓坡，不是一道断崖
    const d = distToCoast(lng, lat);
    const shelf = Math.min(1, d / 3.2);
    const h = -(12 + 320 * Math.pow(shelf, 0.7)) - (noise2(lng * 3, lat * 3) - 0.5) * 30;
    return { h, kind: KIND.SEA, surface: 0 };
  }

  const n = swell(lng, lat);
  let h = reliefAt(lng, lat);
  // 起伏按当地高度缩放：平原只做几米浮动，山地叠两档噪声成脊成棱
  h *= 0.9 + n * 0.2;
  h += (ridgeMid(lng, lat) - 0.5) * Math.min(520, h * 0.42 + 12);
  h += (ridgeFine(lng, lat) - 0.5) * Math.min(240, h * 0.22 + 6);
  h = Math.max(3, h);

  // 大湖：湖区内挖到水面以下，湖周一圈把地形拉到岸高。
  // 岸边过渡同样按当地高度衰减 —— 庐山就夹在长江和鄱阳湖之间，
  // 不衰减的话它会被两边一起抹平成一块滩地
  for (const lake of LAKES) {
    const r = ellipseR(lng, lat, lake);
    if (r > 1.25) continue;
    if (r <= 1) {
      const bowl = 0.4 + 0.6 * Math.cos((r * Math.PI) / 2);
      return { h: lake.surface - lake.depth * bowl, kind: KIND.LAKE, surface: lake.surface };
    }
    const t = (1 - (r - 1) / 0.25) * Math.min(1, 700 / Math.max(140, h));
    h = h * (1 - t) + (lake.surface + 8) * t;
  }


  // 大江：中心线切到水面以下，外侧留一段河谷过渡。
  // 河谷是古人真正走的路，不切出来的话长安、江陵、夔州都会泡在山里。
  // 但过渡强度必须随当地高度衰减 —— 三峡的江面只有七十米、两岸却是一千七，
  // 一视同仁地往水面拉，华山会被渭水削成土坡、庐山会被长江压平。
  //
  // 还有一条更硬的：**河不能高过它的两岸**。控制点给的水面海拔和 RELIEF 插出来的
  // 地面偶尔会打架（黄河源那一段地面只插到三千五，河面数据写的是四千二），
  // 照数据硬铺就会在高原上垒出一条比两岸还高、顶上平的堤 —— 远看像条石阶。
  // 所以水面以当地地面为上限，河只能往下切。
  for (const river of RIVERS) {
    const { d, surface } = nearestOnRiver(lng, lat, river.pts);
    const half = river.width / 2;
    if (d > half * 4) continue;
    const level = Math.min(surface, h);
    if (d < half) return { h: level - 8, kind: KIND.RIVER, surface: level };
    const t = 1 - (d - half) / (half * 3);
    const pull = t * 0.85 * Math.min(1, 700 / Math.max(140, h));
    h = h * (1 - pull) + (level + 14) * pull;
  }



  return { h, kind: KIND.LAND, surface: null };
}

/** 采样成网格，给 three 侧造 mesh */
export function buildHeightField(cols, rows, bbox) {
  const heights = new Float32Array(cols * rows);
  const kinds = new Uint8Array(cols * rows);
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
      if (s.h > maxH) maxH = s.h;
      if (s.h < minH) minH = s.h;
    }
  }
  return { cols, rows, heights, kinds, maxH, minH };
}
