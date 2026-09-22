// 作者星图：把这张表里的作者排成一张古星图。
//
// 为什么是星图而不是柱状图：这张表里作者的分量差得很悬 —— 李白二十首、
// 一百来位只收了一首。柱状图会把长尾压成一排看不清的短线，而星图正相反：
// **亮度分级本来就是给"差几十倍"的量准备的**（星等每差一等，亮度差两倍半），
// 而且中国古星图的画法（绢底、墨点、朱线连宿）与这张图的矿物色是一路的。
//
// 这一层是纯函数：给一批诗，算出每位作者的星等与坐标。表现层只管画。

import { SPOTS } from './spots.js';
import { DYNASTIES } from './taxonomy.js';

/**
 * 星等。取古人的说法：一等最亮，六等是肉眼极限。
 * 门槛按收录篇数定，而不是按百分位 —— 百分位会让"第几名"随数据量漂，
 * 而"收了几首"是能直接读懂的：一等星是这张图里真正写满了江山的那几位。
 */
export const MAGNITUDES = [
  { mag: 1, min: 15, name: '一等星', note: '写满江山的那几位' },
  { mag: 2, min: 10, name: '二等星', note: '各朝的主星' },
  { mag: 3, min: 6, name: '三等星', note: '一望就认得出名字' },
  { mag: 4, min: 4, name: '四等星', note: '有几首压得住的' },
  { mag: 5, min: 2, name: '五等星', note: '两三首传世' },
  { mag: 6, min: 1, name: '六等星', note: '一首，也在天上' },
];

export const magnitudeOf = (count) => MAGNITUDES.find((m) => count >= m.min) ?? MAGNITUDES[MAGNITUDES.length - 1];

/** 名字的确定性散列：星图的抖动不能用随机数，否则每次打开星位都在动 */
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
};

const tally = (values) => {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  const key = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || (a < b ? -1 : 1))[0];
  return { key, count: count.get(key) ?? 0 };
};

const mode = (values) => tally(values).key;

const shortPlace = (place) => place.split('·')[0].split('（')[0];

// 三条旋臂：唐、宋、元各占一条。朝代之间留出空档，免得两朝的星糊在一起。
const ARM_SPAN = 1.72;          // 一条旋臂张开多少弧度
const ARM_GAP = (Math.PI * 2 - ARM_SPAN * 3) / 3;
const TWIST = 1.15;             // 旋臂扭多少：0 是直线，大了就卷成漩涡

/**
 * 算出整张星图。
 * - 亮的在内、暗的在外：中心是李白杜甫王维苏轼那几颗，长尾散在外缘。
 * - 同一朝代的在同一条旋臂上，所以"唐多宋少元更少"一眼看得出来。
 * - 坐标是 -1..1 的归一化值，表现层再乘画布尺寸；**只取决于数据，不取决于时间**。
 */
export function authorStars(spots = SPOTS) {
  const byAuthor = new Map();
  for (const s of spots) {
    if (!byAuthor.has(s.author)) byAuthor.set(s.author, []);
    byAuthor.get(s.author).push(s);
  }

  const stars = [...byAuthor.entries()].map(([name, list]) => {
    const dynasty = mode(list.map((s) => s.dynasty));
    const places = [...new Set(list.filter((s) => s.place).map((s) => shortPlace(s.place)))];
    // 星等的字段要一个一个挑出来：把 magnitudeOf 整个摊进来的话，
    // 它自带的 name（"一等星"）会把作者的名字覆盖掉 —— 这错犯过一次，测试当场抓住。
    const m = magnitudeOf(list.length);
    // 「写得最多的地方」要连着次数一起给表现层：多数作者每处只有一首，
    // 这时并列的第一名是字符序挑出来的，单报一个地名会读成"他常在这里写"，
    // 那是假话。次数带上去，表现层才能在 homeCount <= 1 时换一句话说。
    const home = tally(list.filter((s) => s.lng !== null).map((s) => shortPlace(s.place)));
    return {
      name,
      dynasty,
      count: list.length,
      mag: m.mag,
      tier: m.name,
      tierNote: m.note,
      theme: mode(list.map((s) => s.theme)),
      home: home.key ?? '无定所',
      homeCount: home.count,
      placeCount: places.length,
      poems: list.map((s) => ({ id: s.id, name: s.name, place: s.place })),
    };
  });

  // 名次：先按篇数，再按名字的字符序 —— 并列时不许按数据表顺序，否则插一条数据整张星图就转了
  stars.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  stars.forEach((s, i) => { s.rank = i + 1; });

  const arms = DYNASTIES.map((d) => d.id);
  const perArm = new Map(arms.map((id) => [id, stars.filter((s) => s.dynasty === id)]));

  for (const [dyn, list] of perArm) {
    const armIndex = arms.indexOf(dyn);
    const base = armIndex * (ARM_SPAN + ARM_GAP);
    let prevR = 0;
    list.forEach((star, i) => {
      // 半径按这条旋臂内的名次走，开方是为了让外缘的长尾铺得开、不挤成一圈。
      // 再压一条"最小径向间距"，但**只在内圈压**：内圈那几位（李白、王维、杜甫…）
      // 本来 t 都接近 0，不给最小步长会挤在同一个半径上、名字全叠在一起；
      // 可要是一路压到外圈，外圈那一大群六等星就会被逐个推到边上、连成一个铁环
      // （第一版正是这样，星图变成了一圈钢丝）。
      const t = list.length > 1 ? i / (list.length - 1) : 0;
      const curve = 0.16 + 0.8 * Math.sqrt(t);
      const r = Math.max(curve, Math.min(0.5, prevR + 0.052));
      prevR = r;
      const jitter = (hash(star.name) - 0.5) * (ARM_SPAN / Math.max(4, list.length)) * 2.4;
      const angle = base + ARM_SPAN * t * 0.92 + TWIST * r + jitter;
      star.armIndex = armIndex;
      star.r = r;
      star.x = Math.cos(angle) * r;
      star.y = Math.sin(angle) * r;
    });
  }

  relax(stars);
  return stars;
}

/**
 * 星点不许叠在一起：亮的先占位，暗的被推开。
 * 推的方向沿两星连线，推完仍在 -1..1 之内 —— 这一步是确定性的，
 * 同样的数据跑两遍结果一样（星图不能每次打开都在动）。
 *
 * **收边要放在每一轮里做**，不能等推完了最后统一收：
 * 外圈那一大群六等星挤在一条旋臂上，最后一次性把越界的拉回圆盘，
 * 会把刚刚推开的两颗又按到一起（第一版就这么撞出了 0.002 的间距）。
 */
function relax(stars, passes = 160) {
  const minGap = (a, b) => 0.030 + (7 - a.mag) * 0.006 + (7 - b.mag) * 0.006;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        const gap = minGap(a, b);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 1e-6) { dx = 0.001; dy = 0; d = 0.001; }
        const push = (gap - d) / 2;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        // 亮星（mag 小）动得少：让它守住内圈
        const wa = b.mag / (a.mag + b.mag);
        const wb = a.mag / (a.mag + b.mag);
        a.x -= ux * 2 * wa; a.y -= uy * 2 * wa;
        b.x += ux * 2 * wb; b.y += uy * 2 * wb;
        moved = true;
      }
    }
    for (const s of stars) {
      const d = Math.hypot(s.x, s.y);
      if (d > 1) { s.x /= d; s.y /= d; }
    }
    if (!moved) break;
  }
  for (const s of stars) s.r = Math.hypot(s.x, s.y);
}

/** 榜：按篇数排好的作者名次，表现层的"排行"直接用它 */
export const authorRanking = (spots = SPOTS) => authorStars(spots)
  .map(({ name, dynasty, count, rank, mag, home, homeCount, theme }) => ({ name, dynasty, count, rank, mag, home, homeCount, theme }));
