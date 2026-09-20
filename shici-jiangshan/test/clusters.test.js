// 印章归堆。这层是为了让一张图能承住几百首诗：一处地方一枚印章，
// 而不是一首诗一枚。它是纯函数，所以"长安那几十首会不会并成一处"这种事能在这里测。

import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { clusterSpots, spotToCluster, isPlaced, placelessSpots, shortPlace, CELL_DEG, MERGE_KM } from '../src/atlas/clusters.js';

import { distanceKm } from '../src/atlas/projection.js';

const clusters = clusterSpots();
const PLACED = SPOTS.filter(isPlaced);

test('每首落得住的诗，恰好进一堆；无定所的一堆都不进', () => {
  const inside = clusters.flatMap((c) => c.spots);
  assert.equal(inside.length, PLACED.length, '归堆前后诗的数目对不上');
  assert.equal(new Set(inside.map((s) => s.id)).size, inside.length, '有诗进了两堆');
  for (const s of placelessSpots()) {
    assert.ok(!inside.includes(s), `${s.name} 没有坐标却进了堆`);
  }
});

test('印章比诗少 —— 不然这一层就没意义', () => {
  assert.ok(clusters.length < PLACED.length, `${PLACED.length} 首诗却有 ${clusters.length} 枚印章`);
});

test('长安一带并成一处，地名就叫长安', () => {
  const chunwang = spotById('dufu-chunwang');
  const index = spotToCluster(clusters);
  const changan = index.get(chunwang.id);
  assert.ok(changan, '《春望》没归到任何一堆');
  assert.ok(changan.spots.length >= 3, `长安只并进了 ${changan.spots.length} 首`);
  assert.equal(changan.place, '长安');
  // 同城的几首都该在这一堆里
  assert.ok(changan.spots.some((s) => s.id === 'wangbo-songduyi'));
  assert.ok(changan.spots.some((s) => s.id === 'yuanzhen-lisi'));
});

// 这条是被数据扩到一百多首之后才暴露出来的：写"长安市""长安里巷""长安南郊"的诗
// 各自落进不同格子，长安一地散成三四枚印章，其中一枚还被邻近的乐游原抢了名字 ——
// 于是《无题》的题签上写着"乐游原"。所以约定 place 的首段就是这处地方的身份，
// 细部写在 `·` 之后（"长安·西市"），而这条测试守着它：报同一个地名的诗必须同归一枚印章。
test('报同一个地名的诗必须落在同一枚印章上', () => {
  const index = spotToCluster(clusters);
  const seats = new Map();
  for (const spot of PLACED) {
    const key = shortPlace(spot.place);
    const cluster = index.get(spot.id);
    const seen = seats.get(key);
    if (!seen) seats.set(key, cluster);
    else assert.equal(cluster.id, seen.id, `${key} 散成了两枚印章：${seen.place} 与 ${cluster.place}（因 ${spot.name}）`);
  }
});

test('隔着一条江的两处不会被并掉', () => {
  const index = spotToCluster(clusters);
  const jinling = index.get('liuyuxi-wuyixiang');
  const guazhou = index.get('wanganshi-bochuanguazhou');
  assert.notEqual(jinling.id, guazhou.id, '金陵与瓜洲相距六十公里，不该是一处');
});

// 一枚印章能管多大一片：一格（12 公里）之内本来就在一起，
// 同名近邻合并之后还能再宽一点，但绝不该宽到把两座城并进一枚印章。
test('一堆之内的诗不会隔得太远', () => {
  for (const c of clusters) {
    for (const a of c.spots) {
      for (const b of c.spots) {
        const km = distanceKm(a, b);
        assert.ok(km < MERGE_KM + CELL_DEG * 111.2 * 2, `${c.place} 里 ${a.name} 与 ${b.name} 差了 ${km.toFixed(0)}km`);
      }
    }
  }
});

test('地名相同但隔得远的两处不会被并掉', () => {
  const index = spotToCluster(clusters);
  const jiangnan = SPOTS.filter((s) => isPlaced(s) && s.place.startsWith('江南'));
  if (jiangnan.length >= 2) {
    const far = jiangnan.filter((s) => distanceKm(jiangnan[0], s) > MERGE_KM);
    for (const s of far) {
      assert.notEqual(index.get(s.id), index.get(jiangnan[0].id), `${s.name} 隔了这么远还被并进同一处`);
    }
  }
});


test('堆的落点在自己成员的经纬度范围里', () => {
  // 留 1e-6 度（约十厘米）的余量：三首诗坐标完全相同时，取平均也会因浮点误差
  // 落到比最大值大 1e-14 的地方，卡得太死会在这种无意义的地方失败
  const eps = 1e-6;
  for (const c of clusters) {
    const lngs = c.spots.map((s) => s.lng);
    const lats = c.spots.map((s) => s.lat);
    assert.ok(c.lng >= Math.min(...lngs) - eps && c.lng <= Math.max(...lngs) + eps, `${c.place} 的落点偏出去了`);
    assert.ok(c.lat >= Math.min(...lats) - eps && c.lat <= Math.max(...lats) + eps, `${c.place} 的落点偏出去了`);
  }
});


// 网格归堆最要紧的性质：分堆只取决于坐标，不取决于数据表的顺序。
// 否则在表里插一首诗，别处的印章会跟着重排，id 也就不能当拾取标识用了。
test('打乱数据表的顺序，分堆结果一模一样', () => {
  const shuffled = [...PLACED].reverse();
  const again = clusterSpots(shuffled);
  assert.equal(again.length, clusters.length);
  const key = (list) => list
    .map((c) => `${c.id}:${c.spots.map((s) => s.id).sort().join(',')}`)
    .sort()
    .join('|');
  assert.equal(key(again), key(clusters));
});

test('印文与印色取堆里最常见的主题和朝代', () => {
  for (const c of clusters) {
    assert.ok(c.spots.some((s) => s.theme === c.theme), `${c.place} 的印文不属于堆里任何一首`);
    assert.ok(c.spots.some((s) => s.dynasty === c.dynasty), `${c.place} 的印色不属于堆里任何一首`);
  }
});

test('每一堆都能从任意一首诗找回来', () => {
  const index = spotToCluster(clusters);
  for (const c of clusters) {
    for (const s of c.spots) assert.equal(index.get(s.id), c);
  }
  assert.equal(index.get('libai-jingyesi'), undefined, '无定所的诗不该找到堆');
});
