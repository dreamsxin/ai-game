// 印章归堆：一枚印章 = 一处地方，不是一首诗。
//
// 《唐诗三百首》里长安一地就有几十首。一首一枚印章的画法到八十首上下就崩了：
// 印章叠成一团、拾取全靠碰运气，而且每枚印章都是一个 sprite、各占一个 draw call。
// 所以判定层先把诗按地方归堆，表现层照堆来画。这一层是纯函数，所以能测。
//
// 分两步：
// 1. **固定网格**（0.12 度，约 12 公里）。网格的好处是结果只取决于坐标本身，
//    不取决于数据表的顺序 —— 新加一首诗不会让别处的印章重新分堆。
// 2. **同名近邻再并一次**。光靠网格有个硬伤：格子边界会把一座城切开 ——
//    《春望》在 34.26°、《乐游原》在 34.23°，相距三公里却落进两格。
//    所以再扫一遍，把地名相同且相距四十公里以内的堆合起来，长安才是一枚印章。
//    "同名"这个条件很要紧：只按距离合会把秦淮河与石头城并掉，
//    而只按名字合会把三处都叫"江南"的地方从润州一路并到姑苏。

import { SPOTS } from './spots.js';
import { distanceKm } from './projection.js';

export const CELL_DEG = 0.12;
export const MERGE_KM = 40;

/** 有没有一个定得住的写作地。定不住的（《静夜思》《锦瑟》）不落在图上，只进列表与检索 */
export const isPlaced = (spot) => Number.isFinite(spot.lng) && Number.isFinite(spot.lat);

const cellKey = (lng, lat) => `${Math.round(lng / CELL_DEG)}:${Math.round(lat / CELL_DEG)}`;

const mean = (nums) => nums.reduce((s, v) => s + v, 0) / nums.length;

/**
 * 众数。并列时**按字符序**取，不按出现先后 ——
 * 这一点是刻意的：并列时取"先出现的那个"会让结果依赖数据表的顺序，
 * 而地名一旦随顺序变，下一步的同名合并就跟着变，整张图的印章都会重排。
 */
const commonest = (values) => {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || (a < b ? -1 : 1))[0];
};


/**
 * 地名取首段："白帝城·三峡" → "白帝城"，"密州（诸城）" → "密州"。
 * 首段就是这处地方的身份：同一首段的诗必须落在同一枚印章上，
 * 所以写数据时**细部要写在 `·` 之后**（"长安·西市" 而不是 "长安市"）——
 * 否则长安一地会按"长安/长安市/长安宫掖"散成好几枚印章。
 */
export const shortPlace = (place) => place.split('·')[0].split('（')[0];

const describe = (keys, spots, order) => ({
  id: `at:${[...keys].sort()[0]}`,
  lng: mean(spots.map((s) => s.lng)),
  lat: mean(spots.map((s) => s.lat)),
  place: commonest(spots.map((s) => shortPlace(s.place))),
  theme: commonest(spots.map((s) => s.theme)),
  dynasty: commonest(spots.map((s) => s.dynasty)),
  spots: [...spots].sort((a, b) => order.get(a.id) - order.get(b.id)),
});

/**
 * 把诗归成一堆堆。每堆带：
 *   id       稳定标识（由格子算出，与数据顺序无关）
 *   lng/lat  堆里各首诗的平均位置
 *   place    堆的地名
 *   theme    堆里最常见的主题 —— 印文刻的是它
 *   dynasty  堆里最常见的朝代 —— 印色取的是它
 *   spots    堆里的诗，按原表顺序
 */
export function clusterSpots(spots = SPOTS) {
  const order = new Map(spots.map((s, i) => [s.id, i]));
  const bins = new Map();
  for (const spot of spots) {
    if (!isPlaced(spot)) continue;
    const key = cellKey(spot.lng, spot.lat);
    const bin = bins.get(key);
    if (bin) bin.push(spot);
    else bins.set(key, [spot]);
  }

  // 一格一堆，先各自描述一遍，好拿到地名与中心点
  let groups = [...bins.entries()]
    .map(([key, group]) => ({ keys: [key], spots: group, ...describe([key], group, order) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 同名近邻合并，直到没得合为止。堆数是百这个量级，暴力扫一遍最省心
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length && !merged; j++) {
        const a = groups[i];
        const b = groups[j];
        if (a.place !== b.place) continue;
        if (distanceKm(a, b) > MERGE_KM) continue;
        const keys = [...a.keys, ...b.keys];
        const union = [...a.spots, ...b.spots];
        groups.splice(j, 1);
        groups[i] = { keys, spots: union, ...describe(keys, union, order) };
        merged = true;
      }
    }
  }

  return groups.map(({ keys, ...cluster }) => cluster);
}

/** 诗 id → 它所在的那一堆。选中、悬停、行迹都要靠它从诗找到印章 */
export function spotToCluster(clusters) {
  const index = new Map();
  for (const cluster of clusters) {
    for (const spot of cluster.spots) index.set(spot.id, cluster);
  }
  return index;
}

/** 定不住地点的那些诗 */
export const placelessSpots = (spots = SPOTS) => spots.filter((s) => !isPlaced(s));
