// 筛选、搜索、统计。UI 只负责把选择传进来，逻辑全在这里，所以能直接测。

import { SPOTS, spotById } from './spots.js';
import { COUNTIES, CATEGORIES, SEASONS, categoryOf, countyOf } from './taxonomy.js';
import { distanceKm } from '../scene/projection.js';

export const EMPTY_FILTER = { counties: [], categories: [], season: 'all', keyword: '' };

const seasonMonths = (id) => (SEASONS.find((s) => s.id === id) ?? SEASONS[0]).months;

function matchesKeyword(spot, kw) {
  if (!kw) return true;
  const hay = [spot.name, spot.county, countyOf(spot.county)?.name, spot.badge, spot.season, spot.ticket, spot.reach, ...spot.highlights, ...spot.tips]
    .join(' ').toLowerCase();
  return hay.includes(kw);
}

export function filterSpots(filter = EMPTY_FILTER, spots = SPOTS) {
  const { counties = [], categories = [], season = 'all', keyword = '' } = filter;
  const months = seasonMonths(season);
  const kw = keyword.trim().toLowerCase();
  return spots.filter((s) => {
    if (counties.length && !counties.includes(s.county)) return false;
    if (categories.length && !categories.includes(s.category)) return false;
    if (season !== 'all' && !s.months.some((m) => months.includes(m))) return false;
    return matchesKeyword(s, kw);
  });
}

export function summarize(spots = SPOTS) {
  const byCounty = Object.fromEntries(COUNTIES.map((c) => [c.id, 0]));
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const s of spots) {
    byCounty[s.county] = (byCounty[s.county] ?? 0) + 1;
    byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  }
  return { total: spots.length, byCounty, byCat };
}

export function nearbySpots(spot, n = 3, spots = SPOTS) {
  return spots
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ spot: s, km: Math.round(distanceKm(spot, s)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

export function headline(filter, spots) {
  const parts = [];
  if (filter.counties.length) parts.push(filter.counties.map((id) => countyOf(id)?.name ?? id).join('、'));
  if (filter.categories.length) parts.push(filter.categories.map((id) => categoryOf(id)?.name ?? id).join('、'));
  if (filter.season !== 'all') parts.push(SEASONS.find((s) => s.id === filter.season)?.name ?? '');
  if (filter.keyword.trim()) parts.push(`「${filter.keyword.trim()}」`);
  const scope = parts.length ? parts.join(' · ') : '全域';
  return `${scope} · ${spots.length} 处景点`;
}
