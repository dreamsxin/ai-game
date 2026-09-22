import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS } from '../src/atlas/spots.js';
import { authorStars, authorRanking, magnitudeOf, MAGNITUDES } from '../src/atlas/starmap.js';
import { DYNASTIES } from '../src/atlas/taxonomy.js';

const stars = authorStars();

test('每位作者正好一颗星，篇数加起来是全表', () => {
  const authors = new Set(SPOTS.map((s) => s.author));
  assert.equal(stars.length, authors.size, `作者 ${authors.size} 位，星 ${stars.length} 颗`);
  assert.equal(stars.reduce((n, s) => n + s.count, 0), SPOTS.length);
  for (const s of stars) assert.ok(authors.has(s.name), `${s.name} 不在表里`);
});

test('名次按篇数降序，并列时按字符序 —— 不许随数据表顺序变', () => {
  for (let i = 1; i < stars.length; i++) {
    const a = stars[i - 1];
    const b = stars[i];
    assert.ok(a.count > b.count || (a.count === b.count && a.name < b.name), `${a.name} 与 ${b.name} 排反了`);
    assert.equal(b.rank, i + 1);
  }
});

// 星等是这张图的"分量刻度"：篇数越多越亮（mag 越小），而且必须单调 ——
// 不单调的话，一等星旁边冒出一颗更暗却更大的星，整张图就读不成排行了。
test('篇数越多越亮，星等单调', () => {
  for (const s of stars) assert.equal(s.mag, magnitudeOf(s.count).mag, `${s.name} 星等不对`);
  for (let i = 1; i < stars.length; i++) {
    assert.ok(stars[i].mag >= stars[i - 1].mag, `${stars[i].name} 比前一位少却更亮`);
  }
  assert.equal(magnitudeOf(1).mag, 6, '只收一首也该在天上，是六等星');
  assert.ok(MAGNITUDES.every((m, i) => i === 0 || m.min < MAGNITUDES[i - 1].min), '星等门槛该递减');
});

test('三朝各占一条旋臂，星都在圆盘之内', () => {
  const arms = DYNASTIES.map((d) => d.id);
  for (const s of stars) {
    assert.ok(arms.includes(s.dynasty), `${s.name} 的朝代不在词表里`);
    assert.equal(s.armIndex, arms.indexOf(s.dynasty), `${s.name} 站错了旋臂`);
    assert.ok(Math.hypot(s.x, s.y) <= 1.0001, `${s.name} 跑出了圆盘`);
  }
  for (const id of arms) assert.ok(stars.some((s) => s.dynasty === id), `${id} 这条旋臂上一颗星都没有`);
});

// 星点叠在一起就点不中也读不出名字，所以排布之后要留得下间距。
test('星点不叠在一起', () => {
  let worst = Infinity;
  let pair = '';
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
      if (d < worst) { worst = d; pair = `${stars[i].name} 与 ${stars[j].name}`; }
    }
  }
  assert.ok(worst > 0.028, `${pair} 只差 ${worst.toFixed(4)}，会叠在一起`);
});

test('同样的数据算两遍，星位一模一样', () => {
  const again = authorStars();
  for (let i = 0; i < stars.length; i++) {
    assert.equal(again[i].name, stars[i].name);
    assert.ok(Math.abs(again[i].x - stars[i].x) < 1e-12, `${stars[i].name} 的星位在动`);
    assert.ok(Math.abs(again[i].y - stars[i].y) < 1e-12, `${stars[i].name} 的星位在动`);
  }
});

test('打乱输入的顺序，星位也一样', () => {
  const shuffled = [...SPOTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * 7919) % (i + 1);   // 确定性的乱序，不用随机数
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const other = authorStars(shuffled);
  assert.equal(other.length, stars.length);
  for (let i = 0; i < stars.length; i++) {
    assert.equal(other[i].name, stars[i].name, '名次随输入顺序变了');
    assert.ok(Math.abs(other[i].x - stars[i].x) < 1e-12, `${stars[i].name} 的星位随输入顺序变了`);
  }
});

test('每颗星都带得出它的诗、常写的地方与主题', () => {
  for (const s of stars) {
    assert.equal(s.poems.length, s.count, `${s.name} 的诗数对不上`);
    for (const p of s.poems) assert.ok(p.id && p.name, `${s.name} 有一首缺 id 或篇名`);
    assert.ok(typeof s.home === 'string' && s.home.length > 0, `${s.name} 没有常写的地方`);
    assert.ok(typeof s.theme === 'string' && s.theme.length > 0, `${s.name} 没有主题`);
  }
});

// home 是并列时按字符序挑的，所以必须把次数一起报出来：homeCount 为 1 时
// 「写得最多某地」是假话（他在每一处都只有一首），表现层要靠这个数换一句话说。
test('写得最多的地方，次数要对得上', () => {
  for (const s of stars) {
    const placed = s.poems.filter((p) => p.place);
    if (s.home === '无定所') {
      assert.equal(s.homeCount, 0, `${s.name} 报了无定所却还有次数`);
      continue;
    }
    const n = placed.filter((p) => p.place.split('·')[0].split('（')[0] === s.home).length;
    assert.equal(s.homeCount, n, `${s.name} 的 ${s.home} 报了 ${s.homeCount} 首，实为 ${n} 首`);
    assert.ok(s.homeCount >= 1 && s.homeCount <= s.count, `${s.name} 的次数越界`);
  }
});

test('榜首是这张图里收得最多的那位', () => {
  const rank = authorRanking();
  const counts = SPOTS.reduce((o, s) => ({ ...o, [s.author]: (o[s.author] ?? 0) + 1 }), {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  assert.equal(rank[0].name, top[0]);
  assert.equal(rank[0].count, top[1]);
  assert.equal(rank[0].rank, 1);
});
