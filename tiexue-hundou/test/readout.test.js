import test from 'node:test';
import assert from 'node:assert/strict';
import { AMMO_MAX, RELOAD_FILL } from '../src/game/rules.js';
import { startGame } from '../src/game/simulation.js';
import {
  ammoHint,
  ammoLabel,
  ammoMood,
  ammoRatio,
  bossLabel,
  bossRatio,
  chainLabel,
  formatScore,
  formatTime,
  levelLabel,
  muteLabel,
  pickupLabel,
  progressLabel,
  progressRatio,
  recordLabel,
  reloadRatio,
  resultTitle,
  rewardLabel,
  starLabel,
  statusLabel,
  weaponLabel,
} from '../src/scene/readout.js';

const base = startGame(0);

test('分数和时间的格式是定宽的，读表不会跳', () => {
  assert.equal(formatScore(0), '000000');
  assert.equal(formatScore(1234), '001234');
  assert.equal(formatScore(-5), '000000');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(95), '1:35');
  assert.equal(formatTime(-2), '0:00');
});

test('弹匣状态分三档说话，因为玩家的决策也只有三种', () => {
  const player = base.player;
  assert.equal(ammoMood(player), 'ready');
  assert.equal(ammoHint(player), '');
  const low = { ...player, mag: RELOAD_FILL };
  assert.equal(ammoMood(low), 'low');
  assert.match(ammoHint(low), /蹲下|贴上去/);
  const reloading = { ...player, reloading: true, reloadAt: 0.5 };
  assert.equal(ammoMood(reloading), 'reloading');
  assert.equal(ammoHint(reloading), '装填中');
});

test('弹匣与装填的比例都夹在 0～1，装填条只在装填时有长度', () => {
  assert.equal(ammoRatio(base.player), 1);
  assert.equal(ammoRatio({ ...base.player, mag: 0 }), 0);
  assert.equal(ammoRatio({ ...base.player, mag: AMMO_MAX * 3 }), 1);
  assert.equal(reloadRatio(base.player), 0);
  assert.equal(reloadRatio({ ...base.player, reloading: true, reloadAt: 0.4 }), 0.4);
  assert.equal(reloadRatio({ ...base.player, reloading: true, reloadAt: 9 }), 1);
  assert.equal(ammoLabel(base.player), `${AMMO_MAX} / ${AMMO_MAX}`);
});

test('连击只在真连着的时候报，断了就不显示', () => {
  assert.equal(chainLabel({ hitChain: 0 }), '');
  assert.equal(chainLabel({ hitChain: 1 }), '', '一发命中不算连击');
  assert.equal(chainLabel({ hitChain: 4 }), '连击 4');
});

test('Boss 状态直接把「现在打得进去吗」说出来', () => {
  assert.equal(bossLabel(null), '');
  assert.equal(bossLabel({ ...base.boss, active: false }), '');
  assert.match(bossLabel({ ...base.boss, active: true, open: true }), /开/);
  assert.match(bossLabel({ ...base.boss, active: true, open: false }), /闭合/);
  assert.equal(bossLabel({ ...base.boss, active: true, hp: 0 }), '核心已毁');
  assert.equal(bossRatio(base.boss), 1);
  assert.equal(bossRatio({ ...base.boss, hp: 0 }), 0);
  assert.equal(bossRatio(null), 0);
});

test('关卡与进度文案跟着状态走', () => {
  assert.equal(levelLabel(base), '1-1 丛林突入');
  assert.equal(progressLabel(base), '第 1 / 8 关');
  assert.ok(progressRatio(base) < 0.1, '开局进度应该接近 0');
  assert.equal(progressRatio({ ...base, player: { ...base.player, x: base.width } }), 1);
  assert.equal(statusLabel('nope'), '');
  // 结算标题已经写了成败，状态那一行不该只是把标题重复一遍。
  assert.notEqual(statusLabel('over'), resultTitle('over'));
  assert.notEqual(statusLabel('won'), resultTitle('won'));
  assert.equal(resultTitle('won'), '全线突破');
  assert.equal(resultTitle('over'), '任务失败');
});


test('枪名、补给名、星级和旁路开关都有话可说', () => {
  assert.equal(weaponLabel(base.player), '制式步枪');
  assert.equal(weaponLabel({ weapon: 'laser' }), '穿甲激光');
  assert.equal(pickupLabel('ammo'), '弹药箱');
  assert.equal(pickupLabel('???'), '补给');
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(2), '★★☆');
  assert.equal(recordLabel(false), null);
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(muteLabel(true), '音效已关');
  assert.match(rewardLabel(3), /满星/);
  assert.match(rewardLabel(0), /再来一次/);
});
