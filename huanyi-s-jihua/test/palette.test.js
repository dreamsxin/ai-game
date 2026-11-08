// 配色的测试。「色彩鲜明」和「敌弹永远认得出」这两件事都是可以断言的。

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_ART, FLEET, GEAR_HUES, GEAR_SKINS, HAZARD, TIER_COLOR, WING_HUES, WING_SKINS, chapterArt, gearSkin, hsl, hslHex, hueGap } from '../src/scene/palette.js';
import { WINGS } from '../src/game/wings.js';
import { GEAR, GEAR_CODES } from '../src/game/gear.js';

test('外星舰队的能量色不撞敌弹红，也不撞弱点金', () => {
  assert.ok(hueGap(hsl(FLEET.energy).h, hsl(HAZARD.foe).h) > 40, '能量色不能长得像敌弹');
  assert.ok(hueGap(hsl(FLEET.energy).h, hsl(HAZARD.gold).h) > 40, '能量色不能抢弱点金环');
  // 实拍教训：舰体压成近黑（l < 0.2）在深蓝网格地面上整支舰队会消失，
  // 只剩护盾环和几个引擎光点。所以这里守下限，也守「别亮过轮廓」的上限。
  assert.ok(hsl(FLEET.hull).l > 0.2, '舰体不能压成近黑');
  assert.ok(hsl(FLEET.hull).l < 0.5, '舰体不能亮过能量轮廓');
  assert.ok(hsl(FLEET.energy).s > 0.6, '轮廓与能量脊要够饱和');
  assert.notEqual(FLEET.energy, FLEET.rageEnergy, '半血换色得看得出来');
});

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

test('21 型机翼 21 个色相：两两拉开，而且谁都别掉进敌弹的红区', () => {
  const entries = Object.entries(WING_HUES);
  assert.equal(entries.length, Object.keys(WINGS).length, '每一型机翼都该有自己的色相');
  const foe = hsl(HAZARD.foe).h;
  for (const [code, hue] of entries) {
    const gap = hueGap(hue, foe);
    assert.ok(gap > 18, `${code} 的色相 ${hue}° 离敌弹的红（${foe.toFixed(0)}°）只有 ${gap.toFixed(0)}°`);
  }
  const sorted = entries.map(([, hue]) => hue).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
    assert.ok(next - sorted[i] >= 11, `色相 ${sorted[i]}° 和 ${next}° 挨得太近，缩到手机上会看成同一个颜色`);
  }
});

test('每一身皮都读得出：翼面够暗、识别色够亮够饱和', () => {
  for (const code of Object.keys(WINGS)) {
    const skin = WING_SKINS[code];
    assert.ok(skin, `${code} 没有配皮`);
    for (const key of ['body', 'edge', 'lead', 'chrome']) {
      assert.match(skin[key], /^#[0-9a-f]{6}$/, `${code} 的 ${key} 不是十六进制色`);
    }
    assert.ok(hsl(skin.body).l < 0.32, `${code} 的翼面压不住，会盖过机身`);
    const lead = hsl(skin.lead);
    assert.ok(lead.l > 0.55, `${code} 的识别色太暗，夜里看不见`);
    assert.ok(lead.s > 0.6, `${code} 的识别色太灰，和别的型号分不开`);
    assert.ok(hsl(skin.chrome).l > 0.7, `${code} 的炮管色太深，会看不出是金属件`);
  }
});

test('色相换算能走往返：HSL → 十六进制 → HSL', () => {
  for (const hue of [0, 45, 120, 206, 300, 359]) {
    const back = hsl(hslHex(hue, 0.8, 0.5));
    assert.ok(hueGap(back.h, hue) < 2, `${hue}° 换算回来变成了 ${back.h.toFixed(1)}°`);
    assert.ok(Math.abs(back.l - 0.5) < 0.02, `${hue}° 的亮度走样了`);
  }
});

test('三型装备的皮与 gear.js 同源：两两拉开，谁也不掉进敌弹红区', () => {
  assert.equal(Object.keys(GEAR_SKINS).length, GEAR_CODES.length);
  const foe = hsl(HAZARD.foe).h;
  for (const code of GEAR_CODES) {
    assert.equal(GEAR_HUES[code], GEAR[code].hue, `${code} 的色相在两处写了不同的数`);
    assert.ok(hueGap(GEAR_HUES[code], foe) > 30, `${code} 撞上了敌弹的红`);
    const skin = GEAR_SKINS[code];
    for (const key of ['body', 'edge', 'lead', 'chrome', 'halo']) {
      assert.match(skin[key], /^#[0-9a-f]{6}$/, `${code} 的 ${key} 不是十六进制色`);
    }
    assert.ok(hsl(skin.lead).l > 0.6, `${code} 的识别色不够亮`);
    assert.ok(hsl(skin.body).l > hsl(WING_SKINS.C.body).l, '装备机身比机翼亮一档，靠明度分开');
  }
  const hues = GEAR_CODES.map((code) => GEAR_HUES[code]).sort((a, b) => a - b);
  for (let i = 0; i < hues.length; i += 1) {
    const next = i + 1 < hues.length ? hues[i + 1] : hues[0] + 360;
    assert.ok(next - hues[i] >= 60, `装备色相 ${hues[i]}° 和 ${next}° 挨得太近`);
  }
  assert.equal(gearSkin('NOPE'), GEAR_SKINS.E1, '未知型号要有兜底，渲染层不能拿到 undefined');
});
