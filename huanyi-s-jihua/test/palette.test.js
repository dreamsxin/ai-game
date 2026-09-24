// 配色的测试。「色彩鲜明」和「敌弹永远认得出」这两件事都是可以断言的。

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_ART, HAZARD, TIER_COLOR, chapterArt, hsl, hueGap } from '../src/scene/palette.js';

test('四章各一套色，取不到的章号会被夹住', () => {
  assert.equal(CHAPTER_ART.length, 4);
  assert.equal(chapterArt(-3).key, 'I');
  assert.equal(chapterArt(99).key, 'IV');
});

test('每章的亮色都够饱和：这是「色彩鲜明」的具体含义', () => {
  for (const art of CHAPTER_ART) {
    for (const key of ['grid', 'accent', 'sky', 'ridge']) {
      const { s } = hsl(art[key]);
      assert.ok(s > 0.55, `${art.key} 的 ${key} 太灰了：饱和度 ${s.toFixed(2)}`);
    }
  }
});

test('底色够暗，亮色才浮得出来', () => {
  for (const art of CHAPTER_ART) {
    assert.ok(hsl(art.zenith).l < 0.12, `${art.key} 天顶太亮`);
    assert.ok(hsl(art.ground).l < 0.2, `${art.key} 地面太亮`);
    assert.ok(hsl(art.grid).l > hsl(art.ground).l + 0.25, `${art.key} 网格压不过地面`);
  }
});

test('四章之间看得出区别：亮色色相互相拉开', () => {
  for (let i = 0; i < CHAPTER_ART.length; i += 1) {
    for (let j = i + 1; j < CHAPTER_ART.length; j += 1) {
      const gap = hueGap(hsl(CHAPTER_ART[i].grid).h, hsl(CHAPTER_ART[j].grid).h);
      assert.ok(gap > 40, `${CHAPTER_ART[i].key} 和 ${CHAPTER_ART[j].key} 的网格撞色：只差 ${gap.toFixed(0)}°`);
    }
  }
});

test('地形色一律避开敌弹的红——碰到就掉翼的东西不能和背景撞', () => {
  const foe = hsl(HAZARD.foe).h;
  for (const art of CHAPTER_ART) {
    for (const key of ['grid', 'accent', 'ridge', 'sky']) {
      const gap = hueGap(hsl(art[key]).h, foe);
      assert.ok(gap > 30, `${art.key} 的 ${key} 离敌弹的红只有 ${gap.toFixed(0)}°`);
    }
  }
});

test('阶级色一路变暖：蓝 → 青绿 → 金，扫一眼就知道攒到第几阶', () => {
  const tiers = TIER_COLOR.map((hex) => hsl(hex));
  assert.ok(tiers[0].h > 180 && tiers[0].h < 260, 'Mk.I 应该是冷蓝');
  assert.ok(tiers[1].h > 120 && tiers[1].h < 180, 'Mk.II 应该是青绿');
  assert.ok(tiers[2].h > 30 && tiers[2].h < 70, 'Mk.III 应该是暖金');
  for (const hex of TIER_COLOR) assert.ok(hsl(hex).s > 0.6, `${hex} 不够饱和`);
});
