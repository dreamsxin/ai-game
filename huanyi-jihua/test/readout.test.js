import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bossRatio,
  briefLine,
  chainLabel,
  evolveLabel,
  formatScore,
  formatTime,
  gateLabel,
  jettisonLabel,
  labLabel,
  levelLabel,
  muteLabel,
  progressLabel,
  progressRatio,
  recordLabel,
  resultTitle,
  rewardLabel,
  scaleFor,
  starLabel,
  statusLabel,
  tierLabel,
  weakHint,
  weakLabel,
  wingClass,
  wingLabel,
  wingLine,
  wingName,
} from '../src/scene/readout.js';
import { briefing, levelCount } from '../src/game/levels.js';
import { MAX_TIER } from '../src/game/wings.js';

test('分数补零、时间按分秒走', () => {
  assert.equal(formatScore(0), '0000000');
  assert.equal(formatScore(1234), '0001234');
  assert.equal(formatScore(-5), '0000000');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75), '1:15');
});

test('每个状态都有一句人话，没有空白面板', () => {
  for (const status of ['ready', 'select', 'playing', 'paused', 'dying', 'clear', 'over', 'won']) {
    assert.ok(statusLabel(status).length > 0, `${status} 少一句文案`);
  }
  assert.equal(statusLabel('不存在'), '');
});

test('HUD 上的火力状态：裸机是一句警告，不是一个名词', () => {
  assert.equal(wingLabel({ wing: 'C', tier: 1, dive: 0 }), 'C 加农炮');
  assert.equal(wingLabel({ wing: 'C', tier: 2, dive: 0 }), 'C 加农炮 Mk.II');
  assert.ok(wingLabel({ wing: null, dive: 0 }).includes('裸机'));
  assert.ok(wingLabel({ wing: null, dive: 0.6 }).includes('下潜'), '下潜期间是无敌，不该报成裸机');
});

test('阶级标签在 Mk.I 时不占屏幕，升过阶才报', () => {
  assert.equal(tierLabel(1), '');
  assert.equal(tierLabel(2), 'Mk.II');
  assert.equal(tierLabel(3), 'Mk.III');
  assert.equal(tierLabel(99), 'Mk.III');
});

test('进化提示会说清「再捡一个就能升」还是「已经到顶」', () => {
  assert.equal(evolveLabel({ wing: null, tier: 1 }), '');
  assert.ok(evolveLabel({ wing: 'J', tier: 1 }).includes('J'));
  assert.ok(evolveLabel({ wing: 'J', tier: 1 }).includes('Mk.II'));
  assert.equal(evolveLabel({ wing: 'J', tier: MAX_TIER }), '已满阶');
});

test('机翼的出身要写出来：常规、实验还是秘密', () => {
  assert.equal(wingClass('C'), '常规');
  assert.equal(wingClass('G'), '实验');
  assert.equal(wingClass('SS'), '秘密');
  assert.equal(wingClass('不存在'), '');
});

test('实验机翼没解锁时，选翼界面要说清什么时候解锁', () => {
  assert.ok(labLabel(false).includes('解锁'));
  assert.ok(labLabel(true).includes('实验机翼'));
  assert.notEqual(labLabel(true), labLabel(false));
});

test('弃翼键会说明现在按下去有没有用', () => {
  assert.equal(jettisonLabel({ wing: null, lock: 0 }), '无翼可弃');
  assert.equal(jettisonLabel({ wing: 'H', lock: 0.2 }), '锁定中');
  assert.equal(jettisonLabel({ wing: 'H', lock: 0 }), '弃翼下潜');
});

test('机翼名字和说明都取得到，取不到也不炸', () => {
  assert.equal(wingName('J'), '穿甲弹');
  assert.equal(wingName(null), '无机翼');
  assert.ok(wingLine('H').includes('铁球'));
  assert.equal(wingLine('不存在'), '');
});

test('关卡简报一行说清 Boss、弱点和推荐机翼', () => {
  const brief = briefing(2);
  const line = briefLine(brief);
  assert.ok(line.includes(brief.boss));
  assert.ok(line.includes(brief.pick));
  assert.ok(weakLabel(brief.weak).length > 0);
  assert.ok(weakHint(brief.weak).length > 0);
});

test('连消提示只在真连上了才报——连 1 发不值得占屏幕', () => {
  assert.equal(chainLabel(1), '');
  assert.equal(chainLabel(2), '');
  assert.ok(chainLabel(3).includes('3'));
});

test('Boss 血条按比例走，没 Boss 时不画', () => {
  assert.equal(bossRatio({ boss: null }), null);
  assert.equal(bossRatio({ boss: { hp: 50, maxHp: 100 } }), 0.5);
  assert.equal(bossRatio({ boss: { hp: -5, maxHp: 100 } }), 0);
});

test('关卡进度按「Boss 还有多久出场」算，Boss 出来了就是满格', () => {
  assert.equal(progressRatio({ time: 0, boss: null }, 20), 0);
  assert.equal(progressRatio({ time: 10, boss: null }, 20), 0.5);
  assert.equal(progressRatio({ time: 99, boss: null }, 20), 1);
  assert.equal(progressRatio({ time: 3, boss: {} }, 20), 1);
});

test('关卡名和进度都带得出来', () => {
  const state = { levelKey: '03', levelName: '装甲回廊', levelIndex: 2 };
  assert.equal(levelLabel(state), '03 装甲回廊');
  assert.equal(progressLabel(state), `第 3 / ${levelCount} 关`);
});

test('星级点评按拿到几颗给，通关本身不该被挑刺', () => {
  assert.equal(starLabel(3), '★★★');
  assert.equal(starLabel(1), '★☆☆');
  assert.ok(rewardLabel(3).length > 0);
  assert.ok(rewardLabel(0).includes('再来'));
  assert.equal(resultTitle('won'), '全线夺回');
  assert.equal(resultTitle('over'), '任务失败');
});

test('新纪录只在真刷掉旧的最高分时报', () => {
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), null);
  assert.ok(muteLabel(true).includes('关'));
  assert.ok(muteLabel(false).includes('开'));
});

test('跳关提示要把代价说清楚：Boss 不会因为你跳了就变弱', () => {
  assert.equal(gateLabel(null), '');
  assert.ok(gateLabel({ x: 50 }).includes('Boss'));
});

test('场地到画布的换算保持比例，短边贴边、长边居中', () => {
  const wide = scaleFor(600, 300);
  assert.ok(wide.offsetX > 0, '画面太宽时左右留边');
  assert.ok(Math.abs(wide.offsetY) < 0.001);
  const tall = scaleFor(100, 600);
  assert.ok(tall.offsetY > 0, '画面太高时上下留边');
});
