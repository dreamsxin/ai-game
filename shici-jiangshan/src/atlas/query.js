// 诗词筛选、搜索、统计与就近推荐。UI 只把选择传进来，逻辑全在这里，所以能直接测。

import { SPOTS, spotById } from './spots.js';
import { ROUTES, routeById } from './routes.js';
import { DYNASTIES, THEMES } from './taxonomy.js';
import { distanceKm } from './projection.js';
import { isPlaced } from './clusters.js';


export const EMPTY_FILTER = { dynasties: [], themes: [], keyword: '' };

/** 关键词命中：题名、作者、地名、全文、情感、背景、赏析都算，「黄河」「边塞」「李白」都能搜到 */
function matchesKeyword(spot, keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const hay = [spot.name, spot.author, spot.place, spot.text, spot.emotion, spot.context, ...spot.highlights]
    .join(' ')
    .toLowerCase();
  return hay.includes(kw);
}

export function filterSpots(filter = EMPTY_FILTER, spots = SPOTS) {
  const { dynasties = [], themes = [], keyword = '' } = filter;
  return spots.filter((spot) => {
    if (dynasties.length && !dynasties.includes(spot.dynasty)) return false;
    if (themes.length && !themes.includes(spot.theme)) return false;
    return matchesKeyword(spot, keyword);
  });
}

export function summarize(spots = SPOTS) {
  const byDynasty = Object.fromEntries(DYNASTIES.map((d) => [d.id, 0]));
  const byTheme = Object.fromEntries(THEMES.map((t) => [t.id, 0]));
  for (const spot of spots) {
    byDynasty[spot.dynasty] += 1;
    byTheme[spot.theme] += 1;
  }
  return { total: spots.length, byDynasty, byTheme };
}

/**
 * 离某首诗最近的 n 首。山河不变，诗人却一个个走过，这是"同一片地方还写过什么"。
 * 没有定得住地点的诗（《静夜思》《锦瑟》）既不作起点、也不作候选 —— 无从量距。
 */
export function nearbySpots(spot, n = 3, spots = SPOTS) {
  if (!isPlaced(spot)) return [];
  return spots
    .filter((s) => s.id !== spot.id && isPlaced(s))
    .map((s) => ({ spot: s, km: Math.round(distanceKm(spot, s)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}


/** 展开一条诗人行迹：站点换成整首诗，相邻两站给直线里程 */
export function routeDetail(id) {
  const route = routeById(id);
  if (!route) return null;
  const stops = route.stops.map((sid) => spotById(sid)).filter(Boolean);
  const legs = [];
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push({ from: stops[i], to: stops[i + 1], km: Math.round(distanceKm(stops[i], stops[i + 1])) });
  }
  return { ...route, stops, legs, totalKm: legs.reduce((sum, leg) => sum + leg.km, 0) };
}

export const allRouteDetails = () => ROUTES.map((r) => routeDetail(r.id));

/** 题跋式的一行摘要 */
export function headline(filter, spots) {
  const parts = [];
  if (filter.dynasties.length) parts.push(filter.dynasties.map((id) => DYNASTIES.find((d) => d.id === id).name).join('、'));
  if (filter.themes.length) parts.push(filter.themes.map((id) => THEMES.find((t) => t.id === id).name).join('、'));
  if (filter.keyword.trim()) parts.push(`「${filter.keyword.trim()}」`);
  const scope = parts.length ? parts.join(' · ') : '唐宋元三朝';
  return `${scope} · ${spots.length} 首`;
}

export { spotById };
