// 朝代脊骨：轴上分段必须严丝合缝，山高必须说得出道理。

import test from 'node:test';
import assert from 'node:assert/strict';
import { DYNASTIES, AXIS_START, AXIS_END, dynastyById, dynastyAtYear, yearLabel } from '../src/atlas/dynasties.js';

test('轴上分段首尾相接，不留缝也不重叠', () => {
  for (let i = 1; i < DYNASTIES.length; i += 1) {
    assert.equal(DYNASTIES[i].axisStart, DYNASTIES[i - 1].axisEnd, `${DYNASTIES[i].id} 与前一段没有接上`);
  }
  assert.equal(AXIS_START, DYNASTIES[0].axisStart);
  assert.equal(AXIS_END, DYNASTIES[DYNASTIES.length - 1].axisEnd);
});

test('每段都有正的时长，字段齐全', () => {
  const ids = new Set();
  for (const d of DYNASTIES) {
    assert.ok(d.axisEnd > d.axisStart, `${d.id} 时长不为正`);
    assert.ok(!ids.has(d.id), `${d.id} 重复`);
    ids.add(d.id);
    assert.match(d.id, /^[a-z]+$/);
    assert.ok(['legend', 'unified', 'divided'].includes(d.kind));
    assert.ok(d.power > 0 && d.power <= 1);
    assert.ok(d.weight > 0);
    assert.match(d.tint, /^#[0-9a-f]{6}$/);
    for (const key of ['name', 'span', 'capital', 'summary', 'detail']) {
      assert.ok(d[key] && d[key].length > 0, `${d.id}.${key} 空缺`);
    }
    assert.ok(d.summary.length >= 10 && d.summary.length <= 60, `${d.id}.summary 长度 ${d.summary.length}`);
    assert.ok(d.detail.length >= 40, `${d.id}.detail 太短`);
  }
});

test('乱世的峰一定低于两侧最近的大一统', () => {
  const unifiedLeft = (i) => {
    for (let k = i - 1; k >= 0; k -= 1) if (DYNASTIES[k].kind === 'unified') return DYNASTIES[k];
    return null;
  };
  const unifiedRight = (i) => {
    for (let k = i + 1; k < DYNASTIES.length; k += 1) if (DYNASTIES[k].kind === 'unified') return DYNASTIES[k];
    return null;
  };
  let checked = 0;
  DYNASTIES.forEach((d, i) => {
    if (d.kind !== 'divided') return;
    for (const other of [unifiedLeft(i), unifiedRight(i)]) {
      if (!other) continue;
      assert.ok(d.power < other.power, `${d.id}(${d.power}) 不低于 ${other.id}(${other.power})`);
      checked += 1;
    }
  });
  assert.ok(checked >= 10, `只比了 ${checked} 对，乱世段太少`);
});

test('年份落段：区间左闭右开，越界夹到两端', () => {
  assert.equal(dynastyAtYear(-3000).id, DYNASTIES[0].id);
  assert.equal(dynastyAtYear(3000).id, DYNASTIES[DYNASTIES.length - 1].id);
  assert.equal(dynastyAtYear(650).id, 'tang');
  assert.equal(dynastyAtYear(907).id, 'wudai');
  assert.equal(dynastyAtYear(960).id, 'beisong');
  for (const d of DYNASTIES) {
    assert.equal(dynastyAtYear(d.axisStart + 1).id, d.id, `${d.id} 起点后一年落错了段`);
  }
});

test('dynastyById 与 yearLabel', () => {
  assert.equal(dynastyById('tang').name, '唐前期');
  assert.equal(dynastyById('nope'), undefined);
  assert.equal(yearLabel(-221), '前 221 年');
  assert.equal(yearLabel(1644), '1644 年');
});

test('断崖处切开了段：安史之乱、鸦片战争、王莽代汉', () => {
  assert.equal(dynastyAtYear(754).id, 'tang');
  assert.equal(dynastyAtYear(755).id, 'tanghou');
  assert.ok(dynastyById('tang').power - dynastyById('tanghou').power > 0.3, '安史之乱没画成断崖');

  assert.equal(dynastyAtYear(1839).id, 'qing');
  assert.equal(dynastyAtYear(1840).id, 'wanqing');
  assert.ok(dynastyById('qing').power - dynastyById('wanqing').power > 0.3, '晚清没跌下来');

  assert.equal(dynastyAtYear(7).id, 'xihan');
  assert.equal(dynastyAtYear(9).id, 'xinmang');
  assert.equal(dynastyAtYear(25).id, 'donghan');
  assert.ok(dynastyById('xinmang').power < dynastyById('xihan').power);
  assert.ok(dynastyById('xinmang').power < dynastyById('donghan').power);
});
