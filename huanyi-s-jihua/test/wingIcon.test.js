// 选翼界面那张机翼小图的测试。
//
// 守的是一件玩家亲自报过的事：**换了机翼，形状要真的不一样**。
// 所以这里断言的不是「画得好不好看」，而是几条能被看错的账：
// 1. 几路火力就有几根管子／几枚炸弹，一个不多一个不少。
// 2. 炮口摊在翼展上而且左右对称——判定层的 dx 只有 ±1～3 格，照抄会全挤成一坨。
// 3. 三条出身三种皮，且与场上那副三维机翼同一份（否则选的时候是紫的、飞起来是蓝的）。
// 4. 一切都落在 viewBox 里：卡片上的图不到 70 像素宽，越界就是被裁掉。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ICON,
  SEAT_EDGE,
  WING_OUTLINES,
  WING_TIP_X,
  wingChord,
  wingIcon,
  wingSeats,
  wingShape,
  wingTraits,
} from '../src/scene/wingIcon.js';
import { WINGS } from '../src/game/wings.js';
import { WING_SKIN } from '../src/scene/palette.js';

const numbers = (icon) => {
  const list = [];
  for (const points of [...icon.panels, icon.hull]) {
    for (const pair of points.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      list.push({ x, y });
    }
  }
  for (const line of [...icon.leads, ...icon.barrels]) {
    list.push({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
  }
  for (const tip of icon.tips) list.push({ x: tip.x, y: tip.y }, { x: tip.x + tip.w, y: tip.y + tip.h });
  for (const bomb of icon.bombs) list.push({ x: bomb.x - bomb.r, y: bomb.y - bomb.r }, { x: bomb.x + bomb.r, y: bomb.y + bomb.r });
  for (const part of icon.parts) list.push({ x: part.x - part.r, y: part.y - part.r }, { x: part.x + part.r, y: part.y + part.r });
  if (icon.ring) {
    list.push(
      { x: icon.ring.cx - icon.ring.rx - icon.ring.r, y: icon.ring.cy - icon.ring.ry - icon.ring.r },
      { x: icon.ring.cx + icon.ring.rx + icon.ring.r, y: icon.ring.cy + icon.ring.ry + icon.ring.r },
    );
  }
  return list;
};


test('几路火力就画几根管子：列表里看得出这是哪一套', () => {
  for (const [code, spec] of Object.entries(WINGS)) {
    const icon = wingIcon(code);
    const guns = spec.volley.filter((bolt) => !bolt.ground).length;
    const bombs = spec.volley.filter((bolt) => bolt.ground).length;
    assert.equal(icon.barrels.length, guns, `${code} 有 ${guns} 路平射，图上却有 ${icon.barrels.length} 根管子`);
    assert.equal(icon.bombs.length, bombs, `${code} 挂 ${bombs} 枚炸弹，图上却有 ${icon.bombs.length} 枚`);
  }
});

test('扇形张多宽、朝哪打，图上和火力表一致', () => {
  const fan = wingIcon('W').barrels;
  // 5 路扇形：最外两路一路朝左、一路朝右，管子的末端必须真的岔开。
  const leftmost = fan[0];
  const rightmost = fan[fan.length - 1];
  assert.ok(leftmost.x2 < leftmost.x1, 'W 的最左一路要朝左偏');
  assert.ok(rightmost.x2 > rightmost.x1, 'W 的最右一路要朝右偏');

  const back = wingIcon('A').barrels.find((barrel) => barrel.y2 > barrel.y1);
  assert.ok(back, 'A 是前后炮，图上必须有一根朝后的管子');

  const straight = wingIcon('C').barrels;
  for (const barrel of straight) assert.ok(barrel.y2 < barrel.y1 - 4, 'C 两路都是直射，管子朝正前');
});

test('炮口摊在翼展上，而且左右对称', () => {
  for (const [code, spec] of Object.entries(WINGS)) {
    const seats = wingSeats(spec);
    const widest = Math.max(...seats.map(Math.abs));
    const spread = Math.max(...spec.volley.map((bolt) => Math.abs(bolt.dx)));
    if (spread > 0) {
      // 放大有上限（见 wingSeats），所以只要求「探得够远、又不出翼展」。
      assert.ok(widest > 3, `${code} 的最外侧炮口只在 ${widest.toFixed(2)} 格，太挤了看不出路数`);
      assert.ok(widest <= SEAT_EDGE + 1e-6, `${code} 的炮口探到 ${widest.toFixed(2)} 格，超出翼展了`);
    }
    for (const [i, bolt] of spec.volley.entries()) {
      const mirror = spec.volley.findIndex((other) => other.dx === -bolt.dx && bolt.dx !== 0);
      if (mirror >= 0) assert.ok(Math.abs(seats[i] + seats[mirror]) < 1e-6, `${code} 的炮口左右不对称`);
    }
  }
});

test('路数越多翼弦越深，冷却越长越钝', () => {
  assert.ok(wingChord(WINGS.W) > wingChord(WINGS.C) * 1.15, '5 路扇形的翼弦要明显比 2 路加农炮深');
  assert.ok(wingChord(WINGS.J) > wingChord(WINGS.L), '慢得多的穿甲弹不该比激光更利');
  for (const spec of Object.values(WINGS)) {
    const chord = wingChord(spec);
    assert.ok(chord >= 0.75 && chord <= 1.55, `翼弦 ${chord} 超出了范围`);
  }
});

test('三条出身三种皮，而且用的是全局那一份', () => {
  assert.equal(wingIcon('C').skin, WING_SKIN.plain);
  assert.equal(wingIcon('G').skin, WING_SKIN.lab);
  assert.equal(wingIcon('SS').skin, WING_SKIN.secret);
});

test('招牌零件也画出来：引力井有发射环、量子分身有棱镜、反物质有弹舱', () => {
  const kinds = (code) => wingIcon(code).parts.map((part) => part.kind);
  assert.ok(kinds('G').includes('well'), '引力井要有发射环');
  assert.ok(kinds('Q').includes('echo'), '量子分身要有棱镜');
  assert.ok(kinds('Z').includes('coil'), '链弧要有线圈');
  assert.ok(kinds('X').includes('bulb'), '反物质要有弹舱');
  assert.deepEqual(kinds('C'), [], '加农炮没有招牌零件，别乱加');
});

test('环形护翼把那一圈真的画出来：几枚球、环多大都照判定层来', () => {
  for (const code of ['O', 'E', 'H']) {
    const icon = wingIcon(code);
    assert.ok(icon.ring, `${code} 该画出护环`);
    assert.equal(icon.ring.orbs, WINGS[code].orbs, `${code} 环上的球数要和判定层一致`);
  }
  // 远环的圈必须比护环大，不然「贴身」和「挂得远」在选翼界面上分不出来。
  assert.ok(wingIcon('E').ring.rx > wingIcon('O').ring.rx);
  assert.equal(wingIcon('C').ring, null, '没铁球的机翼不该凭空长出一个环');
});

test('翼型从机制里长出来：八种轮廓，机翼不再长得都一样', () => {
  const shapes = new Map();
  for (const code of Object.keys(WINGS)) {
    const shape = wingShape(WINGS[code]);
    assert.ok(WING_OUTLINES[shape], `${code} 落到了一个不存在的翼型 ${shape}`);
    shapes.set(shape, [...(shapes.get(shape) ?? []), code]);
  }
  // 八种轮廓都得有人用，否则「翼型跟着机制走」只是句空话。
  assert.equal(shapes.size, Object.keys(WING_OUTLINES).length, `有翼型没人用：${[...shapes.keys()].join('/')}`);
  // 几条一眼能验的对应关系。
  assert.equal(wingShape(WINGS.O), 'ring', '环形护翼是环形翼');
  assert.equal(wingShape(WINGS.D), 'pylon', '对地机翼是挂架翼');
  assert.equal(wingShape(WINGS.A), 'twin', '前后炮是前后对称的菱形翼');
  assert.equal(wingShape(WINGS.J), 'needle', '穿甲弹是细长针翼');
  assert.equal(wingShape(WINGS.N), 'swept', '超短程的霰弹是前掠短翼');
  assert.equal(wingShape(WINGS.W), 'fan', '五路扇形是大后掠扇形翼');
  assert.equal(wingShape(WINGS.M), 'straight', '三路平行是平直长翼');
  assert.equal(wingShape(WINGS.C), 'delta', '没有特别机制的走标准后掠三角');
});

test('每一种翼型的翼尖都钉在半翼展上：画出来的宽度就是判定用的宽度', () => {
  for (const [shape, outline] of Object.entries(WING_OUTLINES)) {
    const widest = Math.max(...outline.map(([x]) => x));
    assert.equal(widest, WING_TIP_X, `${shape} 的翼尖没有探到 ${WING_TIP_X} 格`);
    assert.ok(outline.length >= 4, `${shape} 的轮廓点太少，画不出形状`);
  }
});

test('翼型真的不一样：两两之间的轮廓不能重复', () => {
  const seen = new Map();
  for (const [shape, outline] of Object.entries(WING_OUTLINES)) {
    const key = outline.map((point) => point.join(',')).join('|');
    assert.ok(!seen.has(key), `${shape} 和 ${seen.get(key)} 是同一条轮廓`);
    seen.set(key, shape);
  }
});

test('每一型都画在框里：越界就是被卡片裁掉', () => {
  for (const code of Object.keys(WINGS)) {
    for (const point of numbers(wingIcon(code))) {
      assert.ok(
        point.x >= -1 && point.x <= ICON.w + 1 && point.y >= -1 && point.y <= ICON.h + 1,
        `${code} 画到了框外：${JSON.stringify(point)}`,
      );
    }
  }
});

test('取不到的型号也给一张图，不炸也不空白', () => {
  const icon = wingIcon('这不是机翼');
  assert.ok(icon.panels.length === 2 && icon.barrels.length > 0);
});

test('铁球的环半径也进 traits：模型和小图都靠它', () => {
  assert.equal(wingTraits(WINGS.O).orbDist, WINGS.O.orbDist);
  assert.equal(wingTraits(WINGS.C).orbs, 0);
  assert.ok(wingTraits(WINGS.X).burst, '反物质弹炸成一圈碎片，这一位要读得出来');
});

