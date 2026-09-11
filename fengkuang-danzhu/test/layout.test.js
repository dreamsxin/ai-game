import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, FIELD_ROWS } from '../src/game/rules.js';
import { fieldBox, toField, toPixel } from '../src/game/layout.js';

test('场地按格居中铺开，短边决定格子大小', () => {
  const box = fieldBox(350, 800, COLUMNS, FIELD_ROWS);
  assert.equal(box.cell, 50, '350/7 = 50 比 800/13 更紧');
  assert.equal(box.originX, 0);
  assert.equal(box.originY, (800 - 50 * 13) / 2);
});

test('多出来的宽度左右各留一半', () => {
  const box = fieldBox(700, 650, COLUMNS, FIELD_ROWS);
  assert.equal(box.cell, 50, '高度更紧，由它决定格子');
  assert.equal(box.originX, 175);
  assert.equal(box.originY, 0);
});

test('像素与格坐标能来回换算', () => {
  const box = fieldBox(700, 650);
  assert.deepEqual(toPixel(box, 2, 3), { x: 275, y: 150 });
  assert.deepEqual(toField(box, 275, 150), { x: 2, y: 3 });
});
