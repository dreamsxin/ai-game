import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { DYNASTIES, THEMES } from '../src/atlas/taxonomy.js';
import { BBOX } from '../src/atlas/projection.js';
import { isLand, elevationAt, KIND } from '../src/atlas/terrain.js';
import { isPlaced } from '../src/atlas/clusters.js';

const DYNASTY_IDS = DYNASTIES.map((d) => d.id);
const THEME_IDS = THEMES.map((t) => t.id);
// 定得住地点的那些：坐标类的检查只对它们成立
const PLACED = SPOTS.filter(isPlaced);


test('诗词表够厚，id 全局唯一', () => {
  assert.ok(SPOTS.length >= 70, `只有 ${SPOTS.length} 首，撑不起一张全国图`);
  const ids = SPOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'id 有重复');
});

// 数据分了册（spots.js 加各 spots-*.js），而且是一批一批攒起来的，
// 于是"同一首诗收了两遍、只是 id 起得不一样"成了最容易犯的错：
// id 唯一性拦不住它，图上会在同一处叠出两枚一样的题签。
// 按"作者+篇名"和"正文开头"各查一遍 —— 两个口子都堵上才算数。
// 篇名只剥「（其二）」「（节）」这类序号后缀：**括注里是首句的不能剥**，
// 李商隐两首《无题》各是一首诗，剥成"无题"就会把它们当成重收。
test('同一首诗不许收两遍', () => {
  const byTitle = new Map();
  const byText = new Map();
  for (const s of SPOTS) {
    const title = `${s.author}《${s.name.replace(/（(其[一二三四五六七八九十]+|节)）\s*$/, '')}》`;
    const seenTitle = byTitle.get(title);
    assert.equal(seenTitle, undefined, `${title} 收了两遍：${seenTitle} 与 ${s.id}`);
    byTitle.set(title, s.id);

    const head = s.text.replace(/\s/g, '').slice(0, 14);
    const seenText = byText.get(head);
    assert.equal(seenText, undefined, `${s.id} 与 ${seenText} 的原文开头一模一样`);
    byText.set(head, s.id);
  }
});

test('每首诗的文字字段都有内容', () => {
  for (const s of SPOTS) {
    for (const key of ['id', 'name', 'author', 'place', 'text', 'emotion', 'context']) {
      assert.equal(typeof s[key], 'string', `${s.id} 的 ${key} 不是字符串`);
      assert.ok(s[key].trim().length > 0, `${s.id} 的 ${key} 是空的`);
    }
    assert.ok(Array.isArray(s.highlights), `${s.name} 的 highlights 不是数组`);
    assert.ok(s.highlights.length >= 1, `${s.name} 没有赏析`);
    for (const line of s.highlights) {
      assert.ok(typeof line === 'string' && line.trim().length > 0, `${s.name} 有空赏析`);
    }
  }
});

// 占位文本一旦混进来，图上点开就是一句空话。
test('诗词原文不是占位文本', () => {
  for (const s of SPOTS) {
    assert.ok(s.text.trim().length >= 12, `${s.name} 的原文只有 ${s.text.trim().length} 字`);
  }
});

test('朝代与主题只能取词表里的 id', () => {
  for (const s of SPOTS) {
    assert.ok(DYNASTY_IDS.includes(s.dynasty), `${s.name} 的朝代 ${s.dynasty} 不在词表里`);
    assert.ok(THEME_IDS.includes(s.theme), `${s.name} 的主题 ${s.theme} 不在词表里`);
  }
});

// 这条曾经抓到过一首落在图外的诗：标记会飘在画卷之外，谁也点不到。
test('每首落得住的诗，坐标都在图框之内', () => {
  for (const s of PLACED) {
    assert.ok(s.lng >= BBOX.minLng && s.lng <= BBOX.maxLng, `${s.name}（${s.lng}）经度出图`);
    assert.ok(s.lat >= BBOX.minLat && s.lat <= BBOX.maxLat, `${s.name}（${s.lat}）纬度出图`);
  }
});

// 定不住地点的（《静夜思》《锦瑟》）只允许"两个都没有"，
// 半个坐标最危险：它会照样落到图上，落在赤道或者本初子午线附近。
// 落不下还有第二种理由：**地方认得出，但在图幅之外** —— 这卷子西边止于玉门关一带（92°E），
// 岑参的北庭、李颀的交河都在更西边，硬挪进画里就是编造，所以同样不落点、只进列表与检索。
test('无定所的诗必须经纬度都空着，并在 place 里交代', () => {
  const placeless = SPOTS.filter((s) => !isPlaced(s));
  assert.ok(placeless.length >= 1, '一首无定所的都没有，这条路径就没人走过');
  for (const s of placeless) {
    assert.equal(s.lng, null, `${s.name} 的经度不是 null`);
    assert.equal(s.lat, null, `${s.name} 的纬度不是 null`);
    assert.ok(
      s.place.includes('无定') || s.place.includes('图外'),
      `${s.name} 的 place 没说清为什么落不下`,
    );
  }
  assert.ok(PLACED.length > SPOTS.length * 0.9, '落不住的诗太多了，这就不是一张地图了');
});

// 落在海里的标记会浮在水面上没有依托。
test('没有一首诗掉进海里', () => {
  for (const s of PLACED) {
    assert.ok(isLand(s.lng, s.lat), `${s.name}（${s.lng}, ${s.lat}）落在海上`);
    const cell = elevationAt(s.lng, s.lat);
    assert.notEqual(cell.kind, KIND.SEA, `${s.name} 的落点被判成海`);
  }
});


test('三朝各有份量，八个主题都不空', () => {
  for (const d of DYNASTIES) {
    const n = SPOTS.filter((s) => s.dynasty === d.id).length;
    assert.ok(n >= 5, `${d.name} 只有 ${n} 首`);
  }
  for (const t of THEMES) {
    const n = SPOTS.filter((s) => s.theme === t.id).length;
    assert.ok(n >= 2, `${t.name} 只有 ${n} 首，筛出来是一张空图`);
  }
});

// 按朝代筛完之后仍应该是一张全国图。元曲最容易犯这个毛病 ——
// 关汉卿、王实甫在大都，乔吉、张可久在杭州，不留神就只剩一南一北两个点。
test('单看某一朝，也不能只剩两三个点', () => {
  for (const d of DYNASTIES) {
    const lngs = PLACED.filter((s) => s.dynasty === d.id).map((s) => s.lng);
    const span = Math.max(...lngs) - Math.min(...lngs);
    assert.ok(span > 8, `${d.name} 的诗只摊开 ${span.toFixed(1)} 度经度`);
  }
});



test('spotById 取得到，取不到就是 undefined', () => {
  for (const s of SPOTS) assert.equal(spotById(s.id), s);
  assert.equal(spotById('mei-you-zhe-shou'), undefined);
  assert.equal(spotById(''), undefined);
});

// 这不是一张只有江南的图：从玉门关到东海都要有诗。
test('诗词在经度上摊得开', () => {
  const bands = new Set(PLACED.map((s) => Math.floor(s.lng)));
  assert.ok(bands.size >= 8, `只覆盖了 ${bands.size} 个整数经度带`);
  assert.ok(Math.min(...PLACED.map((s) => s.lng)) < 100, '西北方向没有诗，边塞就无处落笔');
  assert.ok(Math.max(...PLACED.map((s) => s.lat)) > 38, '北边没有诗，幽州一带会空着');
  assert.ok(Math.min(...PLACED.map((s) => s.lat)) < 24, '南边没有诗，岭南与儋州会空着');
});

