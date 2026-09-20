// 合流与筛选：四个条件是「与」的关系，顺序必须确定。

import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS } from '../src/atlas/events.js';
import { FIGURES } from '../src/atlas/figures.js';
import { BOOKS } from '../src/atlas/books.js';
import {
  ITEMS, KINDS, countsByDynasty, filterItems, itemById, kindName, neighborOf, subtitleOf, tagsOf,
} from '../src/atlas/query.js';

test('三份数据合成一条时间线，按年份升序且顺序确定', () => {
  assert.equal(ITEMS.length, EVENTS.length + FIGURES.length + BOOKS.length);
  for (let i = 1; i < ITEMS.length; i += 1) {
    const a = ITEMS[i - 1];
    const b = ITEMS[i];
    assert.ok(a.year < b.year || (a.year === b.year && a.id < b.id), `${a.id} 与 ${b.id} 的先后不确定`);
  }
});

test('副标题按类型取不同字段，一条都不空', () => {
  for (const it of ITEMS) {
    assert.ok(subtitleOf(it).length > 0, `${it.id} 没有副标题`);
  }
  assert.equal(subtitleOf(EVENTS[0]), EVENTS[0].where);
  assert.equal(subtitleOf(FIGURES[0]), FIGURES[0].role);
  assert.equal(subtitleOf(BOOKS[0]), BOOKS[0].author);
  assert.equal(subtitleOf(null), '');
  assert.equal(kindName('event'), '事件');
});

test('itemById 取得到，取不到返回 undefined', () => {
  assert.equal(itemById(ITEMS[0].id).name, ITEMS[0].name);
  assert.equal(itemById('nope'), undefined);
});

test('按类型筛选', () => {
  for (const kind of KINDS) {
    const got = filterItems({ kinds: [kind] });
    assert.ok(got.length > 0);
    assert.ok(got.every((it) => it.kind === kind));
  }
  assert.equal(filterItems({ kinds: [] }).length, ITEMS.length);
  assert.equal(filterItems({}).length, ITEMS.length);
});

test('按朝代、标签、关键词筛选，三者可以叠加', () => {
  const tang = filterItems({ dynasty: 'tang' });
  assert.ok(tang.length >= 5);
  assert.ok(tang.every((it) => it.dynasty === 'tang'));

  const tag = tagsOf('figure')[0];
  const tagged = filterItems({ kinds: ['figure'], tags: [tag] });
  assert.ok(tagged.length > 0);
  assert.ok(tagged.every((it) => it.tags.includes(tag)));

  const both = filterItems({ dynasty: 'tang', kinds: ['figure'] });
  assert.ok(both.length > 0);
  assert.ok(both.every((it) => it.dynasty === 'tang' && it.kind === 'figure'));
  assert.ok(both.length <= tang.length);
});

test('关键词在名字、正文和标签里都能命中，大小写与空白不敏感', () => {
  const target = ITEMS.find((it) => it.name.length >= 2);
  assert.ok(filterItems({ text: `  ${target.name} ` }).some((it) => it.id === target.id));
  assert.equal(filterItems({ text: '不可能出现的词组xyzzy' }).length, 0);
});

test('筛选结果保持全局顺序', () => {
  const picked = filterItems({ kinds: ['event', 'book'] });
  const order = new Map(ITEMS.map((it, i) => [it.id, i]));
  for (let i = 1; i < picked.length; i += 1) {
    assert.ok(order.get(picked[i].id) > order.get(picked[i - 1].id));
  }
});

test('前后走到头就停住，不循环', () => {
  const list = filterItems({ kinds: ['event'] });
  assert.equal(neighborOf(list, list[0].id, -1).id, list[0].id);
  assert.equal(neighborOf(list, list[list.length - 1].id, 1).id, list[list.length - 1].id);
  assert.equal(neighborOf(list, list[2].id, 1).id, list[3].id);
  assert.equal(neighborOf(list, null, 1).id, list[0].id);
  assert.equal(neighborOf([], 'x', 1), null);
});

test('朝代计数加起来等于总条数', () => {
  const counts = countsByDynasty();
  let total = 0;
  for (const row of counts.values()) {
    assert.equal(row.total, row.event + row.figure + row.book);
    total += row.total;
  }
  assert.equal(total, ITEMS.length);
});

test('标签表按出现次数降序', () => {
  const tags = tagsOf(null);
  assert.ok(tags.length > 5);
  const counts = tags.map((t) => ITEMS.filter((it) => it.tags.includes(t)).length);
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i] <= counts[i - 1], '标签没有按出现次数排');
  }
});
