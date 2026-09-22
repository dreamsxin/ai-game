import test from 'node:test';
import assert from 'node:assert/strict';
import { authorStars } from '../src/atlas/starmap.js';
import { layout, project, hitTest } from '../src/scene/starChart.js';

const stars = authorStars();

// 屏幕尺寸挑的是真会遇到的几种：笔记本、宽屏、超宽、手机竖屏、横躺的手机。
const SCREENS = [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1400],
  [3440, 1440],
  [390, 844],
  [880, 700],
  [960, 500],
];

const spread = (w, h) => {
  const xs = stars.map((s) => project(s, w, h)[0]);
  const ys = stars.map((s) => project(s, w, h)[1]);
  return {
    x: (Math.max(...xs) - Math.min(...xs)) / w,
    y: (Math.max(...ys) - Math.min(...ys)) / h,
    xs,
    ys,
  };
};

// 这条是这次的正题：第一版把半径取成 min(w,h)/2 - pad，于是 2400×1200 上
// 星图只占中间八百多像素、左右各空七百 —— 宽屏等于没适配。
//
// 门槛分两种屏写，因为极坐标的图在超宽屏上铺满就得扁成一条带：
// 到 2:1 以内的屏两个方向都得铺开六成以上；更宽的屏（21:9 之类）只要求
// 短边方向吃满，同时长轴必须已经顶到椭圆上限 —— 也就是宽度已经用尽了。
test('每种屏上星图都铺得开，宽屏不许在两边空出大片绢底', () => {
  for (const [w, h] of SCREENS) {
    const { x, y } = spread(w, h);
    const { rx, ry, ellipseCap } = layout(w, h);
    const short = w >= h ? y : x;
    assert.ok(short > 0.6, `${w}×${h} 短边方向只铺开 ${(short * 100).toFixed(0)}%`);
    if (Math.max(w / h, h / w) <= 2) {
      assert.ok(x > 0.6, `${w}×${h} 横向只铺开 ${(x * 100).toFixed(0)}%，宽度没用起来`);
      assert.ok(y > 0.6, `${w}×${h} 纵向只铺开 ${(y * 100).toFixed(0)}%`);
    } else {
      const long = w >= h ? rx / ry : ry / rx;
      assert.ok(long > ellipseCap - 1e-9, `${w}×${h} 长轴没顶到椭圆上限，宽度还能再用`);
    }
  }
});

test('星点都在画布之内', () => {
  for (const [w, h] of SCREENS) {
    const { xs, ys } = spread(w, h);
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= w, `${w}×${h} 有星跑出左右边`);
    assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= h, `${w}×${h} 有星跑出上下边`);
  }
});

// 铺开不等于可以拉成一条带：星图是极坐标的，长短轴差得太多，
// 旋臂就读不出是旋臂、星等的"远近"也失真。
test('椭圆不许扁过上限 —— 还得看得出是一张星图', () => {
  for (const [w, h] of SCREENS) {
    const { rx, ry, ellipseCap } = layout(w, h);
    const flat = Math.max(rx / ry, ry / rx);
    assert.ok(flat <= ellipseCap + 1e-9, `${w}×${h} 扁到 ${flat.toFixed(2)}`);
  }
});

test('点在一颗星的正中，拾取就该拿到它', () => {
  for (const [w, h] of [[1440, 900], [390, 844], [3440, 1440]]) {
    for (const s of stars) {
      const [x, y] = project(s, w, h);
      const got = hitTest(stars, x, y, w, h);
      assert.ok(got, `${w}×${h} 上 ${s.name} 的正中什么都没点到`);
      // 亮星的拾取半径大，允许被更近的邻星抢走，但不许点到十几像素以外的星
      const [gx, gy] = project(got, w, h);
      assert.ok(Math.hypot(gx - x, gy - y) < 20, `${w}×${h} 上点 ${s.name} 却拿到了 ${got.name}`);
    }
  }
});

test('画布越大，星点与字跟着长大（不是一版手机图放大看）', () => {
  const small = layout(1280, 800);
  const big = layout(2560, 1400);
  assert.ok(big.rx > small.rx * 1.5, '宽屏上星盘没变大');
  assert.ok(big.ry > small.ry * 1.5, '宽屏上星盘没变高');
});
