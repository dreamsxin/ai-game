// 三份条目数据的体检表。内容对不对要人来读，但格式、归段、排序可以让机器守着。

import test from 'node:test';
import assert from 'node:assert/strict';
import { DYNASTIES, dynastyById } from '../src/atlas/dynasties.js';
import { EVENTS } from '../src/atlas/events.js';
import { FIGURES } from '../src/atlas/figures.js';
import { BOOKS } from '../src/atlas/books.js';

const TAGS = {
  event: ['战争', '变法', '开国', '亡国', '迁都', '工程', '制度', '思想', '对外', '灾乱', '条约'],
  figure: ['帝王', '名臣', '将帅', '思想家', '文学家', '史家', '科学家', '工匠艺术', '医家', '改革者', '僧道', '女性'],
  book: ['经部', '史书', '诸子', '诗文', '小说戏曲', '兵书', '农书', '医书', '科技', '地理', '书画', '类书'],
};

const SETS = [
  { name: 'events', list: EVENTS, kind: 'event', prefix: 'ev-', extra: 'where', min: 50 },
  { name: 'figures', list: FIGURES, kind: 'figure', prefix: 'fg-', extra: 'role', min: 85 },
  { name: 'books', list: BOOKS, kind: 'book', prefix: 'bk-', extra: 'author', min: 52 },
];

for (const set of SETS) {
  test(`${set.name}：条数够、id 唯一且守命名规矩`, () => {
    assert.ok(set.list.length >= set.min, `${set.name} 只有 ${set.list.length} 条`);
    const ids = new Set();
    for (const it of set.list) {
      assert.equal(it.kind, set.kind, `${it.id} 的 kind 不对`);
      assert.ok(it.id.startsWith(set.prefix), `${it.id} 缺前缀 ${set.prefix}`);
      assert.match(it.id, /^[a-z-]+$/, `${it.id} 含非法字符`);
      assert.ok(!ids.has(it.id), `${it.id} 重复`);
      ids.add(it.id);
    }
  });

  test(`${set.name}：年份落在自己朝代的区间内`, () => {
    for (const it of set.list) {
      const d = dynastyById(it.dynasty);
      assert.ok(d, `${it.id} 的朝代 ${it.dynasty} 不存在`);
      assert.ok(
        it.year >= d.axisStart && it.year <= d.axisEnd,
        `${it.id}（${it.name}）year=${it.year} 不在 ${d.id} [${d.axisStart},${d.axisEnd}] 内`,
      );
    }
  });

  test(`${set.name}：按年份升序`, () => {
    for (let i = 1; i < set.list.length; i += 1) {
      assert.ok(set.list[i].year >= set.list[i - 1].year, `${set.list[i].id} 排在了 ${set.list[i - 1].id} 之后却更早`);
    }
  });

  test(`${set.name}：字段齐全、长度合规`, () => {
    for (const it of set.list) {
      assert.ok(it.name.length >= 1 && it.name.length <= 7, `${it.id} 名字长度 ${it.name.length}`);
      assert.ok(!it.name.includes('《'), `${it.id} 的 name 不该带书名号`);
      assert.ok(it.when && it.when.length >= 4, `${it.id}.when 太短`);
      assert.ok(it[set.extra] && it[set.extra].length >= 2, `${it.id}.${set.extra} 空缺`);
      assert.ok(it.summary.length >= 15 && it.summary.length <= 60, `${it.id}.summary 长度 ${it.summary.length}`);
      assert.ok(it.detail.length >= 40 && it.detail.length <= 220, `${it.id}.detail 长度 ${it.detail.length}`);
      assert.ok(it.points.length >= 2 && it.points.length <= 4, `${it.id}.points 条数 ${it.points.length}`);
      for (const p of it.points) {
        assert.ok(p.length >= 5 && p.length <= 40, `${it.id} 的要点长度 ${p.length}：${p}`);
      }
      assert.ok(it.tags.length >= 1 && it.tags.length <= 3, `${it.id}.tags 条数 ${it.tags.length}`);
      for (const tag of it.tags) {
        assert.ok(TAGS[set.kind].includes(tag), `${it.id} 用了白名单外的标签「${tag}」`);
      }
    }
  });
}

test('每一段都有条目，没有哪一朝是空的', () => {
  const all = [...EVENTS, ...FIGURES, ...BOOKS];
  for (const d of DYNASTIES) {
    const n = all.filter((it) => it.dynasty === d.id).length;
    assert.ok(n >= 1, `${d.id} 段上一条都没有`);
  }
});

test('人物、事件、典籍三类的 id 不会互相撞', () => {
  const all = [...EVENTS, ...FIGURES, ...BOOKS].map((it) => it.id);
  assert.equal(new Set(all).size, all.length);
});
