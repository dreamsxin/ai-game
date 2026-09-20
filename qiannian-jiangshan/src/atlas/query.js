// 千年江山图——条目的合流与筛选。纯函数，没有 DOM。
//
// 三份数据（事件 / 人物 / 典籍）字段大体一致，各有一个自己的副标题字段：
// 事件是 where、人物是 role、典籍是 author。UI 只认 subtitleOf()，
// 所以往后再加一类条目，只要在这里补一行。
//
// 条目排序统一按 year 升序、同年按 id 字典序——**确定性**很重要：
// 标注避让是贪心的，输入顺序一变，画面就会跳。

import { DYNASTIES } from './dynasties.js';
import { KIND_NAME } from './palette.js';
import { EVENTS } from './events.js';
import { FIGURES } from './figures.js';
import { BOOKS } from './books.js';

/** 三类条目的固定顺序，筛选条按它排。 */
export const KINDS = ['event', 'figure', 'book'];

function byYearThenId(a, b) {
  return a.year - b.year || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 全部条目，事件 + 人物 + 典籍合成一条时间线。 */
export const ITEMS = [...EVENTS, ...FIGURES, ...BOOKS].sort(byYearThenId);

const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/** 按 id 取条目。 */
export function itemById(id) {
  return BY_ID.get(id);
}

/** 条目的副标题：事件说地点，人物说身份，典籍说作者。 */
export function subtitleOf(item) {
  if (!item) return '';
  if (item.kind === 'event') return item.where;
  if (item.kind === 'figure') return item.role;
  return item.author;
}

/** 条目类型的中文名。 */
export function kindName(kind) {
  return KIND_NAME[kind] ?? kind;
}

/** 某一类条目里出现过的全部标签，按出现次数降序（同次数按字面）。 */
export function tagsOf(kind, items = ITEMS) {
  const counts = new Map();
  for (const it of items) {
    if (kind && it.kind !== kind) continue;
    for (const tag of it.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([tag]) => tag);
}

/** 每个朝代各有多少条目（题签下那行小字用它）。 */
export function countsByDynasty(items = ITEMS, list = DYNASTIES) {
  const counts = new Map(list.map((d) => [d.id, { total: 0, event: 0, figure: 0, book: 0 }]));
  for (const it of items) {
    const row = counts.get(it.dynasty);
    if (!row) continue;
    row.total += 1;
    row[it.kind] += 1;
  }
  return counts;
}

function haystack(item) {
  return [item.name, item.summary, item.detail, subtitleOf(item), item.when, ...item.points, ...item.tags]
    .join(' ')
    .toLowerCase();
}

/**
 * 筛选：类型、标签、关键词、朝代四个条件是「与」的关系。
 *   kinds    数组或 Set，空／未传表示不筛
 *   tags     数组或 Set，条目命中任意一个即算通过
 *   text     关键词，在名字、摘要、正文、要点、标签里找
 *   dynasty  朝代 id
 * 返回的数组保持 ITEMS 的顺序。
 */
export function filterItems({ kinds, tags, text, dynasty } = {}, items = ITEMS) {
  const kindSet = kinds && kinds.length !== 0 ? new Set(kinds) : null;
  const tagSet = tags && tags.length !== 0 ? new Set(tags) : null;
  const needle = (text ?? '').trim().toLowerCase();
  return items.filter((it) => {
    if (kindSet && !kindSet.has(it.kind)) return false;
    if (dynasty && it.dynasty !== dynasty) return false;
    if (tagSet && !it.tags.some((t) => tagSet.has(t))) return false;
    if (needle && !haystack(it).includes(needle)) return false;
    return true;
  });
}

/**
 * 在一串条目里找 id 的前后邻居，用于键盘左右键。
 * 到头就停在原地（不循环——长卷有头有尾，循环会让人以为自己走错了方向）。
 */
export function neighborOf(items, id, step) {
  if (!items.length) return null;
  const at = items.findIndex((it) => it.id === id);
  if (at < 0) return items[step > 0 ? 0 : items.length - 1];
  const next = Math.max(0, Math.min(items.length - 1, at + step));
  return items[next];
}
