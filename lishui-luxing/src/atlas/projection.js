// 经纬度 → 场景坐标。地图铺在 XZ 平面，北在 -Z、东在 +X，Y 是高度。
// 丽水范围比全省小得多，所以每度给的场景单位更大；垂直夸张也给得更狠 ——
// 《千里江山图》的山是竖着立起来的，按真实比例摊平就没有那股势。

export const BBOX = { minLng: 118.62, maxLng: 120.52, minLat: 27.30, maxLat: 29.00 };

export const CENTER = {
  lng: (BBOX.minLng + BBOX.maxLng) / 2,
  lat: (BBOX.minLat + BBOX.maxLat) / 2,
};

export const UNITS_PER_DEG_LAT = 950;
export const LNG_SQUEEZE = Math.cos((CENTER.lat * Math.PI) / 180);
export const UNITS_PER_DEG_LNG = UNITS_PER_DEG_LAT * LNG_SQUEEZE;

/** 1 米高程换多少场景单位（含垂直夸张 6 倍） */
export const VERT_EXAGGERATION = 6;
export const UNITS_PER_METER = (UNITS_PER_DEG_LAT / 111.19) * VERT_EXAGGERATION / 1000;

export const MAP_WIDTH = (BBOX.maxLng - BBOX.minLng) * UNITS_PER_DEG_LNG;
export const MAP_DEPTH = (BBOX.maxLat - BBOX.minLat) * UNITS_PER_DEG_LAT;
export const MAP_SIZE = Math.max(MAP_WIDTH, MAP_DEPTH);

/** 场景里的零高度基准：取温溪出境口那 8 米，丽水没有海，得自己定一个底 */
export const DATUM_M = 0;

export const lngToX = (lng) => (lng - CENTER.lng) * UNITS_PER_DEG_LNG;
export const latToZ = (lat) => -(lat - CENTER.lat) * UNITS_PER_DEG_LAT;
export const xToLng = (x) => x / UNITS_PER_DEG_LNG + CENTER.lng;
export const zToLat = (z) => -z / UNITS_PER_DEG_LAT + CENTER.lat;

export const metersToUnits = (m) => (m - DATUM_M) * UNITS_PER_METER;

export const toScene = (lng, lat, meters = 0) => ({
  x: lngToX(lng),
  y: metersToUnits(meters),
  z: latToZ(lat),
});

export const sceneToLngLat = (x, z) => ({ lng: xToLng(x), lat: zToLat(z) });

/** 两点间的大致地表距离（公里），给行程估里程用 */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * 111.19;
  const dLng = (b.lng - a.lng) * 111.19 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}
