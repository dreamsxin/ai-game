// 经纬度 → 场景坐标。整张地图铺在 XZ 平面上，北在 -Z、东在 +X，Y 是高度。
// 纬度方向 1 度固定换成 UNITS_PER_DEG_LAT 个场景单位，经度方向乘 cos(中心纬度) 做收窄，
// 所以省界的形状不会被拉扁。高度做了垂直夸张，否则 2160 米的黄岗山在这个水平尺度上只有 7 个单位高，看不出山。
//
// 江西是个内陆盆地：四面环山、中间向北敞开一个口子（鄱阳湖 → 湖口 → 长江）。
// 所以这里没有「海平面」这个概念 —— 高度零点就是真实海拔 0 米，每片水体各有各的水位（见 geo.js 的 level）。

export const BBOX = { minLng: 113.3, maxLng: 118.65, minLat: 24.25, maxLat: 30.2 };

export const CENTER = {
  lng: (BBOX.minLng + BBOX.maxLng) / 2,
  lat: (BBOX.minLat + BBOX.maxLat) / 2,
};

export const UNITS_PER_DEG_LAT = 340;
export const LNG_SQUEEZE = Math.cos((CENTER.lat * Math.PI) / 180);
export const UNITS_PER_DEG_LNG = UNITS_PER_DEG_LAT * LNG_SQUEEZE;

/** 1 米高程换成多少个场景单位（含垂直夸张 9 倍） */
export const VERT_EXAGGERATION = 9;
export const UNITS_PER_METER = (UNITS_PER_DEG_LAT / 111.19) * VERT_EXAGGERATION / 1000;

export const MAP_WIDTH = (BBOX.maxLng - BBOX.minLng) * UNITS_PER_DEG_LNG;
export const MAP_DEPTH = (BBOX.maxLat - BBOX.minLat) * UNITS_PER_DEG_LAT;
export const MAP_SIZE = Math.max(MAP_WIDTH, MAP_DEPTH);

/** 海拔 0 米在场景里的高度 */
export const DATUM = 0;

/** 省界之外的邻省整块压低这么多个场景单位，江西因此像一块托起来的浮雕板 */
export const PLINTH = 16;

export const lngToX = (lng) => (lng - CENTER.lng) * UNITS_PER_DEG_LNG;
export const latToZ = (lat) => -(lat - CENTER.lat) * UNITS_PER_DEG_LAT;
export const xToLng = (x) => x / UNITS_PER_DEG_LNG + CENTER.lng;
export const zToLat = (z) => -z / UNITS_PER_DEG_LAT + CENTER.lat;

export const metersToUnits = (m) => m * UNITS_PER_METER;

/** 一个点在地图上的落位。meters 省略时贴在海拔 0 米 */
export const toScene = (lng, lat, meters = 0) => ({
  x: lngToX(lng),
  y: DATUM + metersToUnits(meters),
  z: latToZ(lat),
});

export const sceneToLngLat = (x, z) => ({ lng: xToLng(x), lat: zToLat(z) });

/** 两点间的大致地表距离（公里），用来给行程估里程 */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * 111.19;
  const dLng = (b.lng - a.lng) * 111.19 * Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}
