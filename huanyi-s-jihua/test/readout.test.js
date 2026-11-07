import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveLabel,
  bossRatio,
  briefLine,
  chainLabel,
  defeatLabel,
  evolveLabel,
  formatScore,
  formatTime,
  gateLabel,
  jettisonKey,
  labLabel,
  levelLabel,
  muteLabel,
  progressLabel,
  progressRatio,
  recordLabel,
  resultTitle,
  resumeLabel,
  retryLabel,
  rewardLabel,
  runReport,
  scaleFor,
  shareText,
  starLabel,
  statusLabel,
  supplyLabel,
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

test('弃翼动作键分得清四种状态：可按、锁定、没翼、下潜中', () => {
  assert.deepEqual(jettisonKey({ wing: 'H', lock: 0, dive: 0 }), { tone: 'on', sub: '无敌 1s' });
  assert.deepEqual(jettisonKey({ wing: 'H', lock: 0.2, dive: 0 }), { tone: 'lock', sub: '锁定中' });
  assert.deepEqual(jettisonKey({ wing: null, lock: 0, dive: 0 }), { tone: 'off', sub: '无翼可弃' });
  const diving = jettisonKey({ wing: null, lock: 0, dive: 0.9 });
  assert.equal(diving.tone, 'dive');
  assert.ok(diving.sub.includes('下潜'), '下潜中要给倒计时');
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

// ——— 进度、容错与战报的文案 ———

test('补给只在章节最后一关报，别的关卡一句都不多说', () => {
  assert.ok(supplyLabel({ status: 'clear', levelIndex: 3 }).includes('第 1 章完成'));
  assert.ok(supplyLabel({ status: 'clear', levelIndex: 7 }).includes('第 2 章完成'));
  assert.equal(supplyLabel({ status: 'clear', levelIndex: 1 }), '', '章中间过关不报补给');
  assert.equal(supplyLabel({ status: 'playing', levelIndex: 3 }), '', '没结算就不该报');
});

test('失败战报说清楚还差多少，而不是只说任务失败', () => {
  assert.equal(
    defeatLabel({ boss: { hp: 120, maxHp: 480 }, bossName: '机器蜈蚣' }),
    '机器蜈蚣 还剩 25% 体力',
  );
  assert.equal(defeatLabel({ boss: null, bossName: '机器蜈蚣' }), '倒在 Boss 出场之前');
});

test('战绩数字缺字段时按 0 报，不出现 undefined', () => {
  assert.equal(runReport({ kills: 12, pops: 34, wingLosses: 2 }), '击落 12 · 消弹 34 · 掉翼 2 次');
  assert.equal(runReport({}), '击落 0 · 消弹 0 · 掉翼 0 次');
});

test('存档摘要与继续按钮指向同一关，且没存档时不出现', () => {
  assert.equal(archiveLabel({ unlocked: 0, stars: {}, clears: 0 }), null);
  const progress = { unlocked: 8, stars: { '01': 3, '02': 2 }, clears: 1 };
  assert.ok(archiveLabel(progress).includes('进度到第 9 关'));
  assert.ok(archiveLabel(progress).includes('5 / 48 星'));
  assert.equal(resumeLabel(progress), '继续 · 第 9 关');
  assert.equal(retryLabel({ levelIndex: 13 }), '重试第 4 章');
});

test('分享文案带关卡、分数、星级和当前链接', () => {
  const text = shareText({ levelIndex: 6, score: 4321, stars: 2 }, 'https://example.test/?sharecode=X');
  assert.ok(text.includes('第 7 关'));
  assert.ok(text.includes('0004321'));
  assert.ok(text.includes('★★☆'));
  assert.ok(text.includes('https://example.test/?sharecode=X'));
});
