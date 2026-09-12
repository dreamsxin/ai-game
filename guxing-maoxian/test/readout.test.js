import test from 'node:test';
import assert from 'node:assert/strict';
import {
  muteLabel,
  recordLabel,
  resultTitle,
  rewardLabel,
  starLabel,
  statusLabel,
} from '../src/scene/readout.js';

test('只有真刷掉旧的最高分才报新纪录', () => {
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), null);
});

test('音效开关的文案把当前状态说清楚', () => {
  assert.equal(muteLabel(true), '音效已关');
  assert.equal(muteLabel(false), '音效已开');
});

test('星级点评按拿到几颗给，通关时不挑刺', () => {
  assert.match(rewardLabel(3), /满星/);
  assert.match(rewardLabel(2), /满星/);
  assert.notEqual(rewardLabel(2), rewardLabel(3));
  assert.match(rewardLabel(1), /走到底/);
  assert.notEqual(rewardLabel(0), rewardLabel(1), '零星是没走完，不能和走完说一样的话');
});

test('星级用实心和空心凑满三颗', () => {
  assert.equal(starLabel(3), '★★★');
  assert.equal(starLabel(1), '★☆☆');
  assert.equal(starLabel(0), '☆☆☆');
});

test('结算标题分清全线通关和游戏结束', () => {
  assert.equal(resultTitle('won'), '全线通关');
  assert.equal(resultTitle('over'), '游戏结束');
});

test('每个状态都有文案，不会渲染出 undefined', () => {
  for (const status of ['ready', 'playing', 'paused', 'dying', 'clear', 'over', 'won']) {
    assert.ok(statusLabel(status).length > 0, `${status} 少了文案`);
  }
  assert.equal(statusLabel('不存在的状态'), '');
});
