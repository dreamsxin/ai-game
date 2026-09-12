import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_COUNT,
  RANKS,
  cardLabel,
  canPlaceOn,
  freshDeck,
  isRed,
  rankLabel,
  rankOf,
  stacksInRun,
  suitOf,
  suitSymbol,
} from '../src/game/cards.js';

test('一副牌就是 0..103，不重不漏', () => {
  const deck = freshDeck();
  assert.equal(deck.length, CARD_COUNT);
  assert.equal(new Set(deck).size, CARD_COUNT);
  assert.equal(Math.min(...deck), 0);
  assert.equal(Math.max(...deck), CARD_COUNT - 1);
});

test('点数是 1..13 循环，A 是 1、K 是 13', () => {
  assert.equal(rankOf(0), 1);
  assert.equal(rankOf(12), 13);
  assert.equal(rankOf(13), 1);
  assert.equal(rankLabel(0), 'A');
  assert.equal(rankLabel(10), 'J');
  assert.equal(rankLabel(12), 'K');
  for (const id of freshDeck()) {
    assert.ok(rankOf(id) >= 1 && rankOf(id) <= RANKS);
  }
});

test('花色是难度对同一副牌的一层透镜：每种难度下每个点数都正好 8 张', () => {
  for (const suits of [1, 2, 4]) {
    const seen = new Map();
    for (const id of freshDeck()) {
      const key = `${suitOf(id, suits)}-${rankOf(id)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    // 用到的花色数正好是 suits，每个（花色，点数）出现 8 / suits 次
    assert.equal(seen.size, suits * RANKS, `${suits} 花色下应该有 ${suits * RANKS} 种牌面`);
    for (const [key, count] of seen) {
      assert.equal(count, 8 / suits, `${key} 出现了 ${count} 次`);
    }
    // 每个点数总数恒为 8：这是蜘蛛纸牌能收满八门的前提
    for (let rank = 1; rank <= RANKS; rank += 1) {
      const total = freshDeck().filter((id) => rankOf(id) === rank).length;
      assert.equal(total, 8);
    }
  }
});

test('1 花色下全是黑桃，2 花色下黑红各半', () => {
  const deck = freshDeck();
  assert.ok(deck.every((id) => suitOf(id, 1) === 0));
  assert.ok(deck.every((id) => !isRed(id, 1)), '只有一门时不该出现红牌');
  assert.equal(deck.filter((id) => isRed(id, 2)).length, CARD_COUNT / 2);
  assert.equal(suitSymbol(0, 4), '♠');
  assert.equal(suitSymbol(13, 4), '♥');
});

test('整段判定要求同门且逐张递减，落点判定只看点数', () => {
  // 4 花色下：id 12 是黑桃 K，id 11 是黑桃 Q
  assert.ok(stacksInRun(12, 11, 4), '黑桃 K 上接黑桃 Q');
  assert.ok(!stacksInRun(12, 10, 4), '差两点不算连');
  // id 24 是红桃 Q（13..25 是红桃 A..K）
  assert.equal(suitOf(24, 4), 1);
  assert.equal(rankOf(24), 12);
  assert.ok(!stacksInRun(12, 24, 4), '异花不算整段');
  assert.ok(canPlaceOn(12, 24), '但异花照样能压上去');
  assert.ok(!canPlaceOn(12, 12), '同点数压不上去');
});

test('报读用整名，读屏不会只念出符号', () => {
  assert.equal(cardLabel(12, 4), '黑桃K');
  assert.equal(cardLabel(13, 4), '红桃A');
  assert.equal(cardLabel(13, 1), '黑桃A', '一门难度下所有牌都是黑桃');
});
