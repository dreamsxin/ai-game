// 经纬度 → 场景坐标。图铺在 XZ 平面，北在 -Z、东在 +X，Y 是高度。
//
// 这张图的范围是「诗里走到过的地方」：西起玉门关、东到东海、北抵幽州、南达儋州。
// 比一省图大得多，所以每度只能给一百多个场景单位；但《千里江山图》的山是竖着立起来的，
// 按真实比例摊平就完全没有那股势 —— 所以仍要垂直夸张，只是倍数要按图幅重算。

export const BBOX = { minLng: 92.0, maxLng: 122.5, minLat: 18.0, maxLat: 42.0 };

export const CENTER = {
  lng: (BBOX.minLng + BBOX.maxLng) / 2,
  lat: (BBOX.minLat + BBOX.maxLat) / 2,
};

export const UNITS_PER_DEG_LAT = 120;
export const LNG_SQUEEZE = Math.cos((CENTER.lat * Math.PI) / 180);
export const UNITS_PER_DEG_LNG = UNITS_PER_DEG_LAT * LNG_SQUEEZE;

/**
 * 1 米高程换多少场景单位（含垂直夸张）。
 *
 * 倍数是按图幅定的，不能照抄省域图。一格场景单位在这张图上约合 0.93 公里，
 * 照丽水那张的 60 倍算，三千米的秦岭会长到一百八十公里"高"——
 * 于是山脊的坡度全部逼近垂直，整张图糊成一片皱铝箔，
 * 西边三千米以上的高原更是垒成一堵挡住半幅画的墙。
 * 压到 30 倍之后，华山这类两千米的峰仍比自己的山脚宽度高（立得起来），
 * 而中原、江汉重新摊成了平地。
 */
export const VERT_EXAGGERATION = 30;
export const UNITS_PER_METER = ((UNITS_PER_DEG_LAT / 111.19) * VERT_EXAGGERATION) / 1000;


export const MAP_WIDTH = (BBOX.maxLng - BBOX.minLng) * UNITS_PER_DEG_LNG;
export const MAP_DEPTH = (BBOX.maxLat - BBOX.minLat) * UNITS_PER_DEG_LAT;
export const MAP_SIZE = Math.max(MAP_WIDTH, MAP_DEPTH);

/** 场景零高度就取海平面 —— 这张图有海，基准不用另定 */
export const DATUM_M = 0;

export const lngToX = (lng) => (lng - CENTER.lng) * UNITS_PER_DEG_LNG;
export const latToZ = (lat) => -(lat - CENTER.lat) * UNITS_PER_DEG_LAT;
export const xToLng = (x) => x / UNITS_PER_DEG_LNG + CENTER.lng;
export const zToLat = (z) => -z / UNITS_PER_DEG_LAT + CENTER.lat;

export const metersToUnits = (m) => (m - DATUM_M) * UNITS_PER_METER;

/**
 * 海底不按真实深度换算：东海最深处也只有几百米，按陆上的倍数仍是一层薄膜，
 * 海岸会糊成一条毛边。所以负高程另给一条更陡的曲线，海沿岸立刻沉下去。
 */
export const wetToUnits = (m) => -Math.pow(-m, 0.62) * UNITS_PER_METER * 18;


export const toScene = (lng, lat, meters = 0) => ({
  x: lngToX(lng),
  y: meters < 0 ? wetToUnits(meters) : metersToUnits(meters),
  z: latToZ(lat),
});

export const sceneToLngLat = (x, z) => ({ lng: xToLng(x), lat: zToLat(z) });

/** 两点间的大致地表距离（公里）。古人走的是驿道水路，直线只用来说明"有多远" */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * 111.19;
  const dLng = (b.lng - a.lng) * 111.19 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}
