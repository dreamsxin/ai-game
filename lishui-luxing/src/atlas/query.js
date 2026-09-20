// 筛选、搜索、统计、行程展开。UI 只传选择进来，逻辑全在这里，所以能直接测。

import { SPOTS, spotById } from './spots.js';
import { ROUTES, routeById } from './routes.js';
import { REGIONS, CATEGORIES, SEASONS } from './taxonomy.js';
import { distanceKm } from './projection.js';

export const EMPTY_FILTER = { regions: [], categories: [], season: 'all', keyword: '' };

const seasonMonths = (id) => (SEASONS.find((s) => s.id === id) ?? SEASONS[0]).months;

/** 关键词命中：名字、乡镇、头衔、看点、tips 全文都算，「云海」「廊桥」「青瓷」都能搜到 */
function matchesKeyword(spot, keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const hay = [spot.name, spot.place, spot.badge, spot.season, spot.ticket, spot.reach, ...spot.highlights, ...spot.tips]
    .join(' ')
    .toLowerCase();
  return hay.includes(kw);
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

export function summarize(spots = SPOTS) {
  const byRegion = Object.fromEntries(REGIONS.map((r) => [r.id, 0]));
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const spot of spots) {
    byRegion[spot.region] += 1;
    byCategory[spot.category] += 1;
  }
  return { total: spots.length, byRegion, byCategory };
}

/** 离某处最近的 n 个景点。丽水山路绕，所以对外只说"直线" */
export function nearbySpots(spot, n = 3, spots = SPOTS) {
  return spots
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ spot: s, km: Math.round(distanceKm(spot, s)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

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
  if (filter.regions.length) parts.push(filter.regions.map((id) => REGIONS.find((r) => r.id === id).name).join('、'));
  if (filter.categories.length) parts.push(filter.categories.map((id) => CATEGORIES.find((c) => c.id === id).name).join('、'));
  if (filter.season !== 'all') parts.push(SEASONS.find((s) => s.id === filter.season).name);
  if (filter.keyword.trim()) parts.push(`「${filter.keyword.trim()}」`);
  const scope = parts.length ? parts.join(' · ') : '全市九县';
  return `${scope} · ${spots.length} 处`;
}
