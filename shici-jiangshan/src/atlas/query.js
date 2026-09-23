// 诗词筛选、搜索、统计与就近推荐。UI 只把选择传进来，逻辑全在这里，所以能直接测。

import { SPOTS, spotById } from './spots.js';
import { ROUTES, routeById } from './routes.js';
import { DYNASTIES, THEMES } from './taxonomy.js';
import { distanceKm } from './projection.js';
import { isPlaced } from './clusters.js';


export const EMPTY_FILTER = { dynasties: [], themes: [], keyword: '' };

/**
 * 关键词命中：题名、作者、地名、全文、情感、背景、赏析都算，「黄河」「边塞」「李白」都能搜到。
 * 空白分开的几个词是**并且**：「李白 黄河」= 李白写到黄河的那几首。
 * 原先整串去比对，这么输入一次都搜不着，而那是最自然的输入方式（先想起人，再想起句子里的字）。
 */
const terms = (keyword) => (keyword ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);

function matchesKeyword(spot, keyword) {
  const list = terms(keyword);
  if (!list.length) return true;
  const hay = [spot.name, spot.author, spot.place, spot.text, spot.emotion, spot.context, ...spot.highlights]
    .join(' ')
    .toLowerCase();
  return list.every((t) => hay.includes(t));
}

/**
 * 命中在哪一处。列表里只写篇名与作者，所以搜「明月」出来一条《山居秋暝》时，
 * 没人知道它为什么在结果里（命中的是"明月松间照"）—— 更糟的是命中也可能只在赏析里，
 * 那就更像是搜错了。这里把命中的那一处连同左右几个字一起交给表现层去标。
 *
 * 命中在作者或篇名时标 `obvious`：那两项就摆在列表行上，再补一行提示是废话，
 * 表现层照这个标记决定要不要画 —— 提示是给"看不出为什么命中"的那些条准备的。
 * 题解、背景、赏析是我自己写的话，标签要如实说出来，免得读者当成诗里的字。
 */
const HIT_FIELDS = [
  ['author', '作者'],
  ['name', '篇名'],
  ['place', '地名'],
  ['text', '句中'],
  ['emotion', '题解'],
  ['context', '背景'],
];
const OBVIOUS = new Set(['作者', '篇名']);
const AROUND = 8;   // 命中处左右各留几个字：太少看不出上下文，太多在 320px 的卷轴里会折行

export function matchHint(spot, keyword) {
  const list = terms(keyword);
  if (!list.length) return null;
  const hints = list.map((t) => hintFor(spot, t)).filter(Boolean);
  // 多个词时挑最能解释命中的那一个：搜「李白 黄河」该显示"黄河之水天上来"，
  // 而不是把"作者 李白"这件一眼就看见的事再说一遍
  return hints.find((h) => !h.obvious) ?? hints[0] ?? null;
}

function hintFor(spot, low) {
  for (const [key, label] of HIT_FIELDS) {
    const value = spot[key];
    if (typeof value !== 'string') continue;
    const at = value.toLowerCase().indexOf(low);
    if (at >= 0) return clip(value, at, low.length, label);
  }
  for (const line of spot.highlights ?? []) {
    const at = line.toLowerCase().indexOf(low);
    if (at >= 0) return clip(line, at, low.length, '赏析');
  }
  return null;
}

function clip(value, at, len, label) {
  const from = Math.max(0, at - AROUND);
  const to = Math.min(value.length, at + len + AROUND);
  return {
    label,
    obvious: OBVIOUS.has(label),
    before: (from > 0 ? '…' : '') + value.slice(from, at),
    hit: value.slice(at, at + len),
    after: value.slice(at + len, to) + (to < value.length ? '…' : ''),
  };
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
