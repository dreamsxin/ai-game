import test from 'node:test';
import assert from 'node:assert/strict';
import { FOUNDATION_COUNT, LEVELS, PILE_COUNT } from '../src/game/rules.js';
import {
  LEVEL_OPTIONS,
  TUTORIAL_STEPS,
  bestLabel,
  cardFace,
  dealsLabel,
  effectMessage,
  formatScore,
  hintLabel,
  levelDetail,
  levelLabel,
  levelName,
  movesLabel,
  recordLabel,
  rewardLabel,
  runsLabel,
  starLabel,
  statusLabel,
  undoLabel,
} from '../src/scene/readout.js';

test('难度文案带花色数，越界的档号被夹回表内', () => {
  assert.equal(levelName(0), LEVELS[0].name);
  assert.equal(levelLabel(0), `1 花色 · ${LEVELS[0].name}`);
  assert.equal(levelLabel(2), `4 花色 · ${LEVELS[2].name}`);
  assert.equal(levelName(-5), LEVELS[0].name);
  assert.equal(levelName(99), LEVELS.at(-1).name);
  assert.ok(levelDetail(1).length > 0);
  assert.equal(LEVEL_OPTIONS.length, LEVELS.length);
});

test('分数按中文习惯分组，负数被夹到 0', () => {
  assert.equal(formatScore(1300), '1,300');
  assert.equal(formatScore(-40), '0');
});

test('步数、门数、发牌轮数都带单位或分母', () => {
  assert.equal(movesLabel(0), '0 步');
  assert.equal(runsLabel(3), `3 / ${FOUNDATION_COUNT} 门`);
  assert.equal(dealsLabel(4), '还能发 4 轮');
  assert.equal(dealsLabel(0), '牌库已空');
});

test('每种状态都有一句话', () => {
  assert.equal(statusLabel('playing'), '牌局进行中');
  assert.equal(statusLabel('won'), '八门收齐');
  assert.equal(statusLabel('stuck'), '走不动了');
});

test('星数被夹到 0~3，不会多画出一颗空星', () => {
  assert.equal(starLabel(3), '★★★');
  assert.equal(starLabel(1), '★☆☆');
  assert.equal(starLabel(-2), '☆☆☆');
  assert.equal(starLabel(9), '★★★');
});

test('牌面文案是点数加花色符号', () => {
  assert.equal(cardFace(12, 4), 'K♠');
  assert.equal(cardFace(13, 4), 'A♥');
  assert.equal(cardFace(13, 1), 'A♠', '一门难度下所有牌都是黑桃');
});

test('一次动作只出一条提示，取最有信息量的那条', () => {
  assert.equal(effectMessage([{ type: 'won' }]), null, '赢了自有面板，不用提示条');
  assert.match(effectMessage([{ type: 'stuck' }]), /没有可走的一步/);
  assert.match(effectMessage([{ type: 'collect' }]), /收走一门/);
  assert.match(effectMessage([{ type: 'collect' }, { type: 'collect' }]), /2 门/);
  assert.match(effectMessage([{ type: 'flip' }]), /翻开/);
  assert.match(effectMessage([{ type: 'deal' }]), /一轮/);
  assert.match(effectMessage([{ type: 'undo' }]), /撤回/);
  assert.equal(effectMessage([]), null);
});

test('放不下和不能发牌是两种不同的说法', () => {
  assert.match(effectMessage([{ type: 'invalid' }]), /放不下/);
  const emptyPile = effectMessage([{ type: 'invalid', reason: 'empty-pile' }]);
  assert.ok(emptyPile.includes(String(PILE_COUNT)));
  assert.match(emptyPile, /空摞/);
  assert.match(effectMessage([{ type: 'invalid', reason: 'no-stock' }]), /发完/);
});

test('收门的提示压过翻牌：收门是更大的事', () => {
  const both = effectMessage([{ type: 'flip' }, { type: 'collect' }]);
  assert.match(both, /收走一门/);
});

test('撤销按钮标出还能撤几步', () => {
  assert.equal(undoLabel(0), '撤销');
  assert.equal(undoLabel(7), '撤销 7');
});

test('提示文案说清搬哪一摞去哪一摞，给不出答案时说清为什么', () => {
  assert.equal(hintLabel({ from: 0, to: 4, count: 1 }, true), '把第 1 摞顶牌搬到第 5 摞');
  assert.equal(hintLabel({ from: 2, to: 3, count: 3 }, true), '把第 3 摞的 3 张搬到第 4 摞');
  assert.match(hintLabel(null, true), /发一轮/);
  assert.match(hintLabel(null, false), /撤销|重开/);
});

test('只有真刷掉旧成绩才报新纪录，通关点评一星也不说难听话', () => {
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), null);
  assert.match(rewardLabel(3), /一步没废/);
  assert.notEqual(rewardLabel(2), rewardLabel(3));
  assert.ok(rewardLabel(1).length > 0);
  assert.match(bestLabel(0), /还没有成绩/);
  assert.match(bestLabel(1200), /1,200/);
});

test('引导四步讲完，每步都有标题和正文', () => {
  assert.equal(TUTORIAL_STEPS.length, 4);
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.title.length > 0);
    assert.ok(step.detail.length > 6);
  }
  // 目标那一步必须把「八门」这个数说出来
  assert.ok(TUTORIAL_STEPS[0].detail.includes(String(FOUNDATION_COUNT)));
});
