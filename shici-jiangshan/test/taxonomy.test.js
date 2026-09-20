// 朝代与主题：图例、印章、筛选器三处都从这里取值，
// 所以它出错的表现是"印章分不出朝代"或"筛选器少一格"，都不容易一眼看出来。

import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, DYNASTIES, THEMES, dynastyOf, themeOf, hexOf } from '../src/atlas/taxonomy.js';
import { SPOTS } from '../src/atlas/spots.js';

test('矿物色谱里没有重复色', () => {
  const values = Object.values(PALETTE);
  assert.equal(new Set(values).size, values.length);
  for (const c of values) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff);
});

test('三朝各有名字、简介与自己的印色', () => {
  assert.equal(DYNASTIES.length, 3);
  assert.equal(new Set(DYNASTIES.map((d) => d.id)).size, 3);
  assert.equal(new Set(DYNASTIES.map((d) => d.color)).size, 3, '印色撞了就分不出朝代');
  for (const d of DYNASTIES) {
    assert.ok(d.name.length >= 1);
    assert.ok(/\d{3,4}/.test(d.blurb), `${d.id} 的简介里没有年代`);
    assert.ok(Object.values(PALETTE).includes(d.color));
  }
});

test('每个主题一个单字印文，互不重复', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  assert.equal(new Set(THEMES.map((t) => t.glyph)).size, THEMES.length);
  assert.equal(new Set(THEMES.map((t) => t.color)).size, THEMES.length);
  for (const t of THEMES) {
    assert.equal([...t.glyph].length, 1, `${t.id} 的印文不是一个字：${t.glyph}`);
    assert.ok(t.name.length >= 2);
    assert.ok(Object.values(PALETTE).includes(t.color));
  }
});

test('查不到的 id 返回 undefined，而不是兜一个默认值', () => {
  assert.equal(dynastyOf('ming'), undefined);
  assert.equal(themeOf('meiyouzhege'), undefined);
  assert.equal(dynastyOf('tang').name, '唐');
  assert.equal(themeOf('frontier').glyph, '戍');
});

test('hexOf 补足六位，能直接塞进 CSS', () => {
  assert.equal(hexOf(0x2f6a94), '#2f6a94');
  assert.equal(hexOf(0x0000ff), '#0000ff');
  assert.equal(hexOf(0), '#000000');
});

test('每一档朝代与主题都真的有诗，筛选器里没有空格子', () => {
  for (const d of DYNASTIES) {
    assert.ok(SPOTS.some((s) => s.dynasty === d.id), `${d.id} 一首诗都没有`);
  }
  for (const t of THEMES) {
    assert.ok(SPOTS.some((s) => s.theme === t.id), `${t.id} 一首诗都没有`);
  }
});
