import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, resolveZones } from '../src/city/generate.js';
import {
  CONTROL_GROUPS,
  DEFAULT_PARAMS,
  DISTRICT_PRESETS,
  STRUCTURAL,
  paramsForStyle,
} from '../src/city/params.js';
import { STYLES } from '../src/city/styles.js';

const controlKeys = () => CONTROL_GROUPS.flatMap((group) => group.controls.map((c) => c.key));

// App.jsx 只对这四个参数走 applyAppearance（不重建几何），见 src/App.jsx 那个 useEffect 的依赖。
const APPEARANCE = ['lightPreset', 'brightness', 'haze', 'neon'];

test('每个控件要么进结构指纹，要么在外观那条通路上 —— 漏了就是「拖了没反应」', () => {
  // 这是这个项目最容易出的一类静默 bug：加个滑块，忘了把 key 加进 STRUCTURAL，
  // 于是它既不触发重建也不在 applyAppearance 的依赖里，拖动完全没效果，肉眼只会觉得
  // 「这个参数好像没什么用」。这条测试把两条通路的并集钉成控件全集。
  const orphans = controlKeys().filter((key) => !STRUCTURAL.has(key) && !APPEARANCE.includes(key));
  assert.deepEqual(orphans, [], `这些控件既不重建也不改外观：${orphans.join('、')}`);
  // 反过来也不许有重叠：一个参数同时走两条通路等于每次都白重建一次几何。
  const both = APPEARANCE.filter((key) => STRUCTURAL.has(key));
  assert.deepEqual(both, [], `这些参数被算了两遍：${both.join('、')}`);
});

test('结构指纹里的 key 都真有来处：要么是控件，要么是 style/seed', () => {
  const known = new Set([...controlKeys(), 'style', 'seed']);
  for (const key of STRUCTURAL) {
    assert.ok(known.has(key), `STRUCTURAL 里的 ${key} 没有对应控件，也不是 style/seed`);
  }
});

test('默认参数覆盖了每一个控件，面板不会出现 undefined 的滑块', () => {
  for (const key of controlKeys()) {
    assert.ok(key in DEFAULT_PARAMS, `${key} 没有默认值`);
    assert.notEqual(DEFAULT_PARAMS[key], undefined, `${key} 的默认值是 undefined`);
  }
});

test('滑块的默认值都落在自己的区间里 —— 落在区间外会被控件悄悄夹住', () => {
  for (const style of STYLES) {
    const params = paramsForStyle(style.id);
    for (const group of CONTROL_GROUPS) {
      for (const control of group.controls) {
        if (control.type !== 'slider') continue;
        const value = params[control.key];
        assert.ok(
          value >= control.min && value <= control.max,
          `${style.id} 的 ${control.key}=${value} 超出 [${control.min}, ${control.max}]`,
        );
      }
    }
  }
});

test('下拉框的默认值都是选项里存在的 id', () => {
  for (const style of STYLES) {
    const params = paramsForStyle(style.id);
    for (const group of CONTROL_GROUPS) {
      for (const control of group.controls) {
        if (control.type !== 'select') continue;
        assert.ok(
          control.options.some((option) => option.id === params[control.key]),
          `${style.id} 的 ${control.key}=${params[control.key]} 不在选项里`,
        );
      }
    }
  }
});

test('分区比例总是归一化到 1，预设优先于三个滑块', () => {
  const sum = (zones) => zones.commercial + zones.residential + zones.industrial;
  // 用户把三个滑块拉到什么值都行，比例是相对的。
  assert.ok(Math.abs(sum(resolveZones({ districtPreset: 'balanced', commercial: 2, residential: 2, industrial: 4 })) - 1) < 1e-9);
  const skewed = resolveZones({ districtPreset: 'balanced', commercial: 2, residential: 2, industrial: 4 });
  assert.ok(Math.abs(skewed.industrial - 0.5) < 1e-9, '相对比例要保住');

  // 选了预设就完全接管，三个滑块的值不再参与。
  const cbd = resolveZones({ districtPreset: 'cbd', commercial: 0, residential: 0, industrial: 1 });
  assert.ok(cbd.commercial > 0.6, '预设该盖掉滑块');
  for (const [id, preset] of Object.entries(DISTRICT_PRESETS)) {
    if (!preset) continue;
    assert.ok(Math.abs(sum(resolveZones({ districtPreset: id })) - 1) < 1e-9, `${id} 没归一化`);
  }
  // 三个都拉到 0 不该除出 NaN。
  const zero = resolveZones({ districtPreset: 'balanced', commercial: 0, residential: 0, industrial: 0 });
  assert.ok(Number.isFinite(zero.commercial) && Number.isFinite(zero.residential));
});

test('每种风格的默认参数都能直接生成，不需要先动一下面板', () => {
  for (const style of STYLES) {
    const city = generateCity({ ...paramsForStyle(style.id), citySize: 1000 });
    assert.ok(city.buildings.length > 0, `${style.id} 用自带默认值生成不出建筑`);
    assert.equal(city.style.id, style.id);
  }
});
