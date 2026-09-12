import test from 'node:test';
import assert from 'node:assert/strict';
import { MAG_SIZE, MAX_HEALTH, RELOAD_TIME, SCORE_LIMIT, TEAM_ALLY, TEAM_ENEMY } from '../src/game/rules.js';
import {
  accuracyPercent,
  ammoLabel,
  focusLabel,
  formatScore,
  formatTime,
  goalLabel,
  healthRatio,
  kdLabel,
  killfeedText,
  lockLabel,
  muteLabel,
  recordLabel,
  reloadRatio,
  respawnLabel,
  rewardLabel,
  rosterLine,
  scoreLabel,
  statusLabel,
  streakLabel,
  teamLabel,
} from '../src/scene/readout.js';

const stats = (over = {}) => ({ kills: 0, deaths: 0, shots: 0, hits: 0, damage: 0, streak: 0, bestStreak: 0, score: 0, ...over });
const match = (over = {}) => ({
  status: 'playing',
  score: { [TEAM_ALLY]: 0, [TEAM_ENEMY]: 0 },
  stats: stats(),
  ...over,
});

test('时钟补零，且不会走成负数', () => {
  assert.equal(formatTime(180), '3:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(9), '0:09');
  assert.equal(formatTime(-4), '0:00');
});

test('分数取整后按中文习惯分组', () => {
  assert.equal(formatScore(1234.7), '1,234');
  assert.equal(formatScore(-5), '0');
});

test('队伍、比分、目标各有固定说法', () => {
  assert.equal(teamLabel(TEAM_ALLY), '我方');
  assert.equal(teamLabel(TEAM_ENEMY), '敌方');
  assert.equal(scoreLabel({ [TEAM_ALLY]: 7, [TEAM_ENEMY]: 3 }), '7 : 3');
  assert.equal(goalLabel(), `先到 ${SCORE_LIMIT} 分`);
});

test('血量、弹药、换弹进度都被夹在 0 到 1 之间', () => {
  assert.equal(healthRatio({ health: MAX_HEALTH }), 1);
  assert.equal(healthRatio({ health: -20 }), 0);
  assert.equal(healthRatio(null), 0, '人没了也要给得出一个数');
  assert.equal(ammoLabel({ ammo: 7 }), `7 / ${MAG_SIZE}`);
  assert.equal(ammoLabel(null), '- / -');
  assert.equal(reloadRatio({ reloading: 0 }), 0);
  assert.equal(reloadRatio({ reloading: RELOAD_TIME }), 0, '刚开始换弹是 0');
  assert.ok(reloadRatio({ reloading: RELOAD_TIME / 2 }) > 0.4);
});

test('重生倒计时向上取整，活着就不显示', () => {
  assert.equal(respawnLabel({ alive: false, respawnIn: 2.1 }), '3 秒后重生');
  assert.equal(respawnLabel({ alive: true, respawnIn: 0 }), '');
  assert.equal(respawnLabel(null), '');
});

test('命中率、战绩、连杀播报', () => {
  assert.equal(accuracyPercent(stats({ hits: 3, shots: 12 })), '25%');
  assert.equal(accuracyPercent(stats()), '0%', '一枪没开不该除零');
  assert.equal(kdLabel(stats({ kills: 4, deaths: 2 })), '4 / 2');
  assert.equal(streakLabel(1), '', '一杀不算连杀');
  assert.equal(streakLabel(3), '3 连杀');
});

test('软锁状态写在 HUD 上，端稳分成两段', () => {
  assert.equal(lockLabel({ targetId: null }), '自由瞄准');
  assert.equal(lockLabel({ targetId: 'enemy-0', locked: false }), '辅助跟枪');
  assert.equal(lockLabel({ targetId: 'enemy-0', locked: true }), '已锁定');
  assert.equal(focusLabel({ focus: 0 }), '');
  assert.equal(focusLabel({ focus: 0.5 }), '收枪中');
  assert.equal(focusLabel({ focus: 1 }), '端稳');
});

test('击杀播报和花名册', () => {
  assert.equal(killfeedText({ killer: '阿岚', victim: '灰隼' }), '阿岚 淘汰了 灰隼');
  assert.equal(rosterLine({ name: '你', alive: true, health: 61.2 }), '你 62');
  assert.equal(rosterLine({ name: '你', alive: false, respawnIn: 1.2 }), '你 2s');
});

test('每种状态都有一句话，打平和落败不能混为一谈', () => {
  assert.equal(statusLabel(match({ status: 'ready' })), '3v3 团队死斗 · 准备开打');
  assert.equal(statusLabel(match()), '交火中');
  assert.equal(statusLabel(match({ status: 'paused' })), '暂停');
  assert.equal(
    statusLabel(match({ status: 'won', score: { [TEAM_ALLY]: 15, [TEAM_ENEMY]: 9 } })),
    '我方拿下 15 : 9',
  );
  assert.equal(
    statusLabel(match({ status: 'over', score: { [TEAM_ALLY]: 9, [TEAM_ENEMY]: 15 } })),
    '敌方拿下 9 : 15',
  );
  assert.equal(
    statusLabel(match({ status: 'over', score: { [TEAM_ALLY]: 11, [TEAM_ENEMY]: 11 } })),
    '打平 11 : 11',
  );
});

test('静音和纪录的文案', () => {
  assert.equal(muteLabel(true), '音效已关');
  assert.equal(muteLabel(false), '音效已开');
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), '');
});

test('结算评价说清这一局赢在哪、输在哪', () => {
  const won = (over) => rewardLabel(match({ status: 'won', score: { [TEAM_ALLY]: 15, [TEAM_ENEMY]: 8 }, ...over }));
  assert.equal(won({ stats: stats({ kills: 6, deaths: 2 }) }), '压着打，这一局是你带出来的');
  assert.equal(won({ stats: stats({ kills: 3, deaths: 5 }) }), '拿下了，交换比再压一点就更稳');
  // 0 比 0 拿下的一局是队友抬的，不该夸玩家。
  assert.equal(won({ stats: stats() }), '拿下了，交换比再压一点就更稳');

  assert.equal(
    rewardLabel(match({ status: 'over', score: { [TEAM_ALLY]: 11, [TEAM_ENEMY]: 11 }, stats: stats({ kills: 4, deaths: 4 }) })),
    '打平，差的就是最后一个人头',
  );
  const lost = (over) => rewardLabel(match({ status: 'over', score: { [TEAM_ALLY]: 8, [TEAM_ENEMY]: 15 }, stats: stats(over) }));
  assert.equal(lost({ kills: 7, deaths: 3 }), '个人数据不亏，输在团队交换');
  assert.equal(lost({ kills: 1, deaths: 9 }), '被压住了，多贴掩体、开火前先端稳');
});
