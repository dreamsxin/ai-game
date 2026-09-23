import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { ROUTES } from '../src/atlas/routes.js';
import { DYNASTIES, THEMES } from '../src/atlas/taxonomy.js';
import {
  filterSpots, summarize, nearbySpots, headline, routeDetail, allRouteDetails, matchHint, EMPTY_FILTER,
} from '../src/atlas/query.js';

const kw = (keyword) => filterSpots({ ...EMPTY_FILTER, keyword });

test('空筛选返回全部', () => {
  assert.equal(filterSpots(EMPTY_FILTER).length, SPOTS.length);
  assert.equal(filterSpots().length, SPOTS.length);
});

test('按朝代、按主题、两者叠加都是正确的子集', () => {
  const tang = filterSpots({ ...EMPTY_FILTER, dynasties: ['tang'] });
  assert.ok(tang.length > 0);
  assert.ok(tang.every((s) => s.dynasty === 'tang'));

  const frontier = filterSpots({ ...EMPTY_FILTER, themes: ['frontier'] });
  assert.ok(frontier.length > 0);
  assert.ok(frontier.every((s) => s.theme === 'frontier'));

  const both = filterSpots({ ...EMPTY_FILTER, dynasties: ['tang'], themes: ['frontier'] });
  assert.ok(both.every((s) => s.dynasty === 'tang' && s.theme === 'frontier'));
  assert.ok(both.length <= Math.min(tang.length, frontier.length), '叠加不该比单条更多');
  assert.equal(both.length, tang.filter((s) => s.theme === 'frontier').length);

  const multi = filterSpots({ ...EMPTY_FILTER, dynasties: ['song', 'yuan'] });
  assert.equal(multi.length, SPOTS.filter((s) => s.dynasty !== 'tang').length, '多选朝代应是并集');
});

// 关键词搜的是全文：作者、地名、诗句、背景、赏析都算。
test('关键词能搜到作者、地名与诗句里的字', () => {
  assert.ok(kw('李白').length >= 5, '李白的诗应该不止几首');
  const hay = (s) => [s.name, s.author, s.place, s.text, s.emotion, s.context, ...s.highlights].join(' ');
  assert.ok(kw('李白').every((s) => hay(s).includes('李白')));
  assert.ok(kw('扬州').length >= 2, '扬州应能搜到');
  assert.ok(kw('黄河').length >= 2, '黄河应能搜到');
  assert.ok(kw('明月').length >= 2, '明月应能搜到');
  assert.ok(kw('明月').some((s) => s.text.includes('明月')), '明月至少要命中一句诗');
  assert.equal(kw(' 李白 ').length, kw('李白').length, '首尾空格应被裁掉');
});

test('搜不到的词返回空数组', () => {
  assert.deepEqual(kw('阿尔卑斯山脉'), []);
  assert.deepEqual(kw('zzzzzz'), []);
  // 英文的大小写不影响结果
  assert.equal(kw('ABCDEF').length, kw('abcdef').length);
});

// 搜「明月」会出来《山居秋暝》——命中的是"明月松间照"。列表里只有篇名与作者时
// 这看着像搜错了，所以每条结果都要能说出命中在哪个字段、哪几个字。
test('每条命中都说得出命中在哪一处', () => {
  const hits = kw('明月');
  assert.ok(hits.length > 3);
  for (const s of hits) {
    const hint = matchHint(s, '明月');
    assert.ok(hint, `${s.author}《${s.name}》命中了却说不出命中在哪`);
    assert.equal(hint.hit, '明月');
    assert.ok(['作者', '地名', '篇名', '句中', '题解', '背景', '赏析'].includes(hint.label), `字段名 ${hint.label} 不在词表里`);
    // 片段必须是原文里真有的一段，不能是拼出来的
    const plain = (hint.before + hint.hit + hint.after).replace(/…/g, '');
    const source = [s.name, s.author, s.place, s.text, s.emotion, s.context, ...s.highlights].join('\u0000');
    assert.ok(source.includes(plain), `${s.name} 的片段「${plain}」在原文里找不到`);
  }
});

test('命中在作者或篇名时标 obvious —— 那两项就在列表行上，不必再补一行', () => {
  const libai = SPOTS.find((s) => s.author === '李白');
  assert.equal(matchHint(libai, '李白').label, '作者');
  assert.equal(matchHint(libai, '李白').obvious, true);
  const byName = SPOTS.find((s) => s.name.includes('黄鹤楼'));
  assert.equal(matchHint(byName, '黄鹤楼').label, '篇名');
  assert.equal(matchHint(byName, '黄鹤楼').obvious, true);
  // 句中命中要画出来：这是"看不出为什么命中"的那一类
  const inText = SPOTS.find((s) => s.text.includes('明月') && !s.name.includes('明月') && !s.place.includes('明月'));
  assert.equal(matchHint(inText, '明月').label, '句中');
  assert.equal(matchHint(inText, '明月').obvious, false);
  assert.equal(matchHint(libai, ''), null);
  assert.equal(matchHint(libai, '阿尔卑斯'), null);
});

test('空白分开的几个词是"并且"：先想起人、再想起句里的字，这么搜得着', () => {
  const both = kw('李白 黄河');
  assert.ok(both.length >= 1, '「李白 黄河」应当搜得到李白写黄河的那几首');
  for (const s of both) {
    const hay = [s.name, s.author, s.place, s.text, s.emotion, s.context, ...s.highlights].join(' ');
    assert.ok(hay.includes('李白') && hay.includes('黄河'), `${s.name} 少了一个词`);
  }
  // 并且，所以结果一定不多于任一单词的结果
  assert.ok(both.length <= Math.min(kw('李白').length, kw('黄河').length));
  // 多词时命中提示挑那个"看不出来的"：显示黄河所在的句子，而不是"作者 李白"
  const hint = matchHint(both[0], '李白 黄河');
  assert.equal(hint.obvious, false);
  assert.ok(hint.hit === '黄河' || hint.label !== '作者');
  // 前后空格与连续空格不影响
  assert.equal(kw('  李白   黄河  ').length, both.length);
});

test('命中片段在长文里要截短，两头用省略号交代还有字', () => {
  const long = SPOTS.find((s) => s.text.length > 40 && s.text.includes('月'));
  const hint = matchHint(long, '月');
  assert.ok(hint.before.length + hint.after.length < 24, '片段截得不够短，会在卷轴里折成好几行');
  const at = long.text.indexOf('月');
  if (at > 8) assert.ok(hint.before.startsWith('…'), '前面还有字却没有省略号');
});

test('summarize 的各项之和等于总数', () => {
  const stats = summarize(SPOTS);
  assert.equal(stats.total, SPOTS.length);
  assert.equal(DYNASTIES.reduce((n, d) => n + stats.byDynasty[d.id], 0), stats.total);
  assert.equal(THEMES.reduce((n, t) => n + stats.byTheme[t.id], 0), stats.total);

  const onlyYuan = summarize(filterSpots({ ...EMPTY_FILTER, dynasties: ['yuan'] }));
  assert.equal(onlyYuan.byDynasty.tang, 0);
  assert.equal(onlyYuan.byDynasty.yuan, onlyYuan.total);
});

test('nearbySpots 不含自己、按距离升序、长度有上限', () => {
  const self = SPOTS[0];
  const near = nearbySpots(self, 4);
  assert.equal(near.length, 4);
  assert.ok(near.every((n) => n.spot.id !== self.id), '不该把自己算进来');
  for (let i = 1; i < near.length; i++) {
    assert.ok(near[i - 1].km <= near[i].km, '没有按距离升序');
  }
  assert.ok(nearbySpots(self, 100).length <= SPOTS.length - 1);
  assert.equal(nearbySpots(self, 1).length, 1);
});

test('headline 说清当前范围和数量', () => {
  const all = headline(EMPTY_FILTER, SPOTS);
  assert.match(all, new RegExp(`${SPOTS.length} 首`));
  assert.match(all, /唐宋元三朝/);

  const line = headline({ dynasties: ['tang'], themes: ['frontier'], keyword: ' 玉门 ' }, []);
  assert.match(line, /唐/);
  assert.match(line, /边塞征戍/);
  assert.match(line, /「玉门」/);
  assert.match(line, /0 首/);
});

test('每条诗人行迹都能完整展开', () => {
  const details = allRouteDetails();
  assert.equal(details.length, ROUTES.length);
  for (const d of details) {
    assert.ok(d, '有一条行迹展开成了 null');
    assert.ok(d.stops.length >= 3, `${d.name} 只有 ${d.stops.length} 站`);
    assert.ok(d.stops.every(Boolean), `${d.name} 有一站是空的`);
    assert.equal(d.legs.length, d.stops.length - 1, `${d.name} 的段数与站数不匹配`);
    assert.ok(d.totalKm > 0, `${d.name} 的总里程是 ${d.totalKm}`);
    assert.equal(d.totalKm, d.legs.reduce((sum, leg) => sum + leg.km, 0));
    assert.ok(typeof d.poet === 'string' && d.poet.trim().length > 0, `${d.name} 没有主角`);
  }
});

test('行迹上的每一站都在诗词表里', () => {
  for (const route of ROUTES) {
    for (const id of route.stops) {
      assert.ok(spotById(id), `${route.name} 的站点 ${id} 在 SPOTS 里找不到`);
    }
    const detail = routeDetail(route.id);
    assert.equal(detail.stops.length, route.stops.length, `${route.name} 有站点被丢掉了`);
    assert.deepEqual(detail.stops.map((s) => s.id), route.stops);
  }
});

test('取不存在的行迹返回 null', () => {
  assert.equal(routeDetail('不存在'), null);
  assert.equal(routeDetail(''), null);
});
