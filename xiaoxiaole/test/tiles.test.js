import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, SPECIAL_LABELS, isSpecial, sameKind, specialFor, tile } from '../src/game/tiles.js';

const group = (overrides) => ({ shape: 'line', runLength: 3, orientation: 'h', ...overrides });

test('六种果实各有颜色和名字', () => {
  assert.equal(KINDS.length, 6);
  assert.equal(new Set(KINDS).size, 6, '果实种类不应重复');
});

test('同色判定要求两颗果实都存在', () => {
  assert.ok(sameKind(tile('berry'), tile('berry')));
  assert.equal(sameKind(tile('berry'), tile('lemon')), false);
  assert.equal(sameKind(tile('berry'), null), false);
});

test('特殊果实标记只认 special 字段', () => {
  assert.equal(isSpecial(tile('berry')), false);
  assert.ok(isSpecial(tile('berry', 'row')));
  assert.ok(SPECIAL_LABELS.rainbow);
});

test('三连不出特殊果实', () => {
  assert.equal(specialFor(group()), null);
});

test('四连按方向出直线爆果', () => {
  assert.equal(specialFor(group({ runLength: 4, orientation: 'h' })), 'row');
  assert.equal(specialFor(group({ runLength: 4, orientation: 'v' })), 'col');
});

test('五连出彩虹果，L 形优先出爆破果', () => {
  assert.equal(specialFor(group({ runLength: 5 })), 'rainbow');
  assert.equal(specialFor(group({ runLength: 5, shape: 'L' })), 'bomb', 'L 形即使有 5 格也出爆破果');
});
