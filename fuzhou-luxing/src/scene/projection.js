// 经纬度 → 画卷坐标 → 屏幕像素。纯函数，没有 canvas，所以可以直接测。
//
// 中间那一层「画卷坐标」是为了让经度按中心纬度收窄：抚州在北纬 27 度半，
// 一度经度只有一度纬度的 0.89 倍长，不收窄的话整张图会被横着拉开，山也跟着变胖。

import { BBOX } from '../data/geo.js';

export const CENTER_LAT = (BBOX.minLat + BBOX.maxLat) / 2;
export const LNG_SQUEEZE = Math.cos((CENTER_LAT * Math.PI) / 180);

/** 画卷坐标：x 向东、y 向南，单位是「收窄后的度」，原点在图的左上角 */
export const toScroll = (lng, lat) => ({
  x: (lng - BBOX.minLng) * LNG_SQUEEZE,
  y: BBOX.maxLat - lat,
});

export const SCROLL_W = (BBOX.maxLng - BBOX.minLng) * LNG_SQUEEZE;
export const SCROLL_H = BBOX.maxLat - BBOX.minLat;

/**
 * 铺满视口的基准缩放：让整卷都进画面，四周留 pad 像素的天地。
 * 抚州是南北长的形状，所以在宽屏里通常由高度决定缩放，左右会剩出空白 ——
 * 那块空白正好留给题名和印章，这是卷轴该有的样子。
 */
export function fitScale(width, height, pad = 48) {
  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);
  return Math.min(w / SCROLL_W, h / SCROLL_H);
}

/**
 * 视图状态：scale 是每「度」多少像素，cx/cy 是画面中心对应的画卷坐标。
 * 所有的平移缩放都只改这三个数，画笔那边拿到的是同一个 project()。
 */
export function createView(width, height) {
  const scale = fitScale(width, height);
  return { width, height, scale, base: scale, cx: SCROLL_W / 2, cy: SCROLL_H / 2 };
}

export function project(view, lng, lat) {
  const p = toScroll(lng, lat);
  return {
    x: view.width / 2 + (p.x - view.cx) * view.scale,
    y: view.height / 2 + (p.y - view.cy) * view.scale,
  };
}

export function unproject(view, x, y) {
  const sx = (x - view.width / 2) / view.scale + view.cx;
  const sy = (y - view.height / 2) / view.scale + view.cy;
  return {
    lng: sx / LNG_SQUEEZE + BBOX.minLng,
    lat: BBOX.maxLat - sy,
  };
}

/** 缩放范围：最小是刚好铺满，最大放到 6 倍，再大就只能看见笔触 */
export const ZOOM_MIN = 0.85;
export const ZOOM_MAX = 6;

export function zoomAt(view, factor, px, py) {
  const before = unproject(view, px, py);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (view.scale * factor) / view.base));
  const scale = view.base * zoom;
  const next = { ...view, scale };
  const after = unproject(next, px, py);
  const a = toScroll(before.lng, before.lat);
  const b = toScroll(after.lng, after.lat);
  next.cx += a.x - b.x;
  next.cy += a.y - b.y;
  return clampView(next);
}

export function panView(view, dxPx, dyPx) {
  return clampView({ ...view, cx: view.cx - dxPx / view.scale, cy: view.cy - dyPx / view.scale });
}

/** 别让画卷被拖出画面：中心点留在卷面内加半屏的范围里 */
export function clampView(view) {
  const halfW = view.width / 2 / view.scale;
  const halfH = view.height / 2 / view.scale;
  const padX = Math.max(0, halfW - SCROLL_W * 0.15);
  const padY = Math.max(0, halfH - SCROLL_H * 0.15);
  return {
    ...view,
    cx: Math.min(SCROLL_W + padX, Math.max(-padX, view.cx)),
    cy: Math.min(SCROLL_H + padY, Math.max(-padY, view.cy)),
  };
}

export const zoomOf = (view) => view.scale / view.base;

/** 两点间的大致地表距离（公里），用来算「顺路还有」 */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * 111.19;
  const dLng = (b.lng - a.lng) * 111.19 * Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}
