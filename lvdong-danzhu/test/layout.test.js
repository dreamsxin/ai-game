import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, FIELD_ROWS } from '../src/game/rules.js';
import { fieldBox, fieldX, toField, toPixel } from '../src/game/layout.js';

test('场地按格居中铺开，短边决定格子大小', () => {
  const box = fieldBox(450, 800, COLUMNS, FIELD_ROWS);
  assert.equal(box.cell, 50, '450/9 = 50 比 800/16 = 50 相等时取同一个值');
  assert.equal(box.originX, 0);
  assert.equal(box.originY, 0);
});

test('多出来的宽度左右各留一半', () => {
  const box = fieldBox(600, 800, COLUMNS, FIELD_ROWS);
  assert.equal(box.cell, 50, '高度更紧，由它决定格子');
  assert.equal(box.originX, 75);
  assert.equal(box.originY, 0);
});

test('像素与格坐标能来回换算', () => {
  const box = fieldBox(450, 800);
  assert.deepEqual(toPixel(box, 2, 3), { x: 100, y: 150 });
  assert.deepEqual(toField(box, 100, 150), { x: 2, y: 3 });
});

test('挡板只关心横轴，取的就是同一套换算', () => {
  const box = fieldBox(600, 800);
  assert.equal(fieldX(box, 75), 0, '场地左边缘');
  assert.equal(fieldX(box, 75 + 225), 4.5, '场地正中是第 4.5 格');
});
