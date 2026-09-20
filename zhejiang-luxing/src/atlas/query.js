// 筛选、搜索、统计和行程展开。UI 只负责把用户的选择传进来，逻辑全在这里，所以能直接测。

import { SPOTS, spotById } from './spots.js';
import { ROUTES, routeById } from './routes.js';
import { REGIONS, CATEGORIES, SEASONS } from './taxonomy.js';
import { distanceKm } from './projection.js';

export const EMPTY_FILTER = { regions: [], categories: [], season: 'all', keyword: '' };

const seasonMonths = (id) => (SEASONS.find((s) => s.id === id) ?? SEASONS[0]).months;

/** 关键词命中：名字、城市、看点、tips 全文都算，这样「日出」「云海」「海鲜」都能搜到 */
function matchesKeyword(spot, keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const haystack = [spot.name, spot.city, spot.badge, spot.season, spot.ticket, spot.reach, ...spot.highlights, ...spot.tips]
    .join(' ')
    .toLowerCase();
  return haystack.includes(kw);
}

export function filterSpots(filter = EMPTY_FILTER, spots = SPOTS) {
  const { regions = [], categories = [], season = 'all', keyword = '' } = filter;
  const months = seasonMonths(season);
  return spots.filter((spot) => {
    if (regions.length && !regions.includes(spot.region)) return false;
    if (categories.length && !categories.includes(spot.category)) return false;
    if (season !== 'all' && !spot.months.some((m) => months.includes(m))) return false;
    return matchesKeyword(spot, keyword);
  });
}

/** 图例上的计数：每个分区、每个类别各有多少个景点落在当前筛选里 */
export function summarize(spots = SPOTS) {
  const byRegion = Object.fromEntries(REGIONS.map((r) => [r.id, 0]));
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const spot of spots) {
    byRegion[spot.region] += 1;
    byCategory[spot.category] += 1;
  }
  return { total: spots.length, byRegion, byCategory };
}

/** 离某点最近的 n 个景点，用于「这附近还有什么」 */
export function nearbySpots(spot, n = 3, spots = SPOTS) {
  return spots
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ spot: s, km: Math.round(distanceKm(spot, s)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/**
 * 把行程展开成可渲染的形状：站点对象 + 每段直线距离 + 总里程。
 * 直线距离不是驾车里程，所以对外只说「直线」。
 */
export function routeDetail(id) {
  const route = routeById(id);
  if (!route) return null;
  const stops = route.stops.map((sid) => spotById(sid)).filter(Boolean);
  const legs = [];
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push({ from: stops[i], to: stops[i + 1], km: Math.round(distanceKm(stops[i], stops[i + 1])) });
  }
  const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  return { ...route, stops, legs, totalKm };
}

export const allRouteDetails = () => ROUTES.map((r) => routeDetail(r.id));

/** 一句话摘要，HUD 上用 */
export function headline(filter, spots) {
  const parts = [];
  if (filter.regions.length) parts.push(filter.regions.map((id) => REGIONS.find((r) => r.id === id).name).join('、'));
  if (filter.categories.length) parts.push(filter.categories.map((id) => CATEGORIES.find((c) => c.id === id).name).join('、'));
  if (filter.season !== 'all') parts.push(SEASONS.find((s) => s.id === filter.season).name);
  if (filter.keyword.trim()) parts.push(`「${filter.keyword.trim()}」`);
  const scope = parts.length ? parts.join(' · ') : '全省';
  return `${scope} · ${spots.length} 个景点`;
}
