// 题签上的字数。这是唯一一条伸进表现层的测试，因为它测的是纯字符串函数，
// 而它守的那件事（全卷视角下的字墙）恰恰是浏览器里最难量的：
// 一条二百多像素的横幅乘十几首，江南就被糊掉了。

import test from 'node:test';
import assert from 'node:assert/strict';
import { briefTitle } from '../src/scene/atlasGroup.js';
import { SPOTS } from '../src/atlas/spots.js';

test('短诗名原样写出，长的截到词牌或加省略号', () => {
  assert.equal(briefTitle('念奴娇·过洞庭'), '念奴娇·过洞庭');
  assert.equal(briefTitle('静夜思'), '静夜思');
  assert.equal(briefTitle('破阵子·为陈同甫赋壮词以寄之'), '破阵子…');
  assert.equal(briefTitle('水调歌头·明月几时有'), '水调歌头…');
  assert.equal(briefTitle('送温处士归黄山白鹅峰旧居'), '送温处士归黄山…');
  // 曲牌只有两个字时不能截到曲牌：「哨遍」认不出是哪一首
  assert.equal(briefTitle('哨遍·高祖还乡（节）'), '哨遍·高祖还乡…');
});


test('截出来的仍看得出是哪一首：没截的原样留着，截过的至少留三个字', () => {
  for (const s of SPOTS) {
    const brief = briefTitle(s.name);
    const kept = brief.replace('…', '');
    assert.ok(s.name.startsWith(kept), `${s.name} 的截法对不上原名`);
    if (brief === s.name) continue;
    assert.ok([...kept].length >= 3, `${s.name} 截成了 ${brief}`);
  }
});


test('没有一首诗的题签长到会糊掉半个江南', () => {
  for (const s of SPOTS) {
    const line = `${briefTitle(s.name)}·${s.author}`;
    assert.ok(line.length <= 13, `题签太长：${line}（${line.length} 字）`);
  }
});
