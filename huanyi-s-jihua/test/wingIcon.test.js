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
  WING_FAMILY,
  WING_OUTLINES,
  WING_TIP_X,
  wingChord,
  wingIcon,
  wingSeats,
  wingTraits,
  wingTrim,
} from '../src/scene/wingIcon.js';
import { WINGS } from '../src/game/wings.js';
import { WING_SKINS } from '../src/scene/palette.js';

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
  for (const fin of icon.fins) list.push({ x: fin.x1, y: fin.y1 }, { x: fin.x2, y: fin.y2 });
  for (const pod of icon.pods) list.push({ x: pod.x - pod.r, y: pod.y - pod.r }, { x: pod.x + pod.r, y: pod.y + pod.r });
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

test('每一型用自己的那身皮：21 型 21 个色，卡片和场上同源', () => {
  for (const code of Object.keys(WINGS)) {
    assert.equal(wingIcon(code).skin, WING_SKINS[code], `${code} 的小图没有用它自己的皮`);
  }
  const leads = Object.keys(WINGS).map((code) => WING_SKINS[code].lead);
  assert.equal(new Set(leads).size, leads.length, '有两型机翼的识别色是同一个');
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

test('翼型一型一条：21 条轮廓，两两不重复，翼尖都钉在半翼展上', () => {
  const codes = Object.keys(WINGS);
  assert.equal(Object.keys(WING_OUTLINES).length, codes.length, '轮廓数量该和机翼数量一致');
  const seen = new Map();
  for (const code of codes) {
    const outline = WING_OUTLINES[code];
    assert.ok(outline, `${code} 没有自己的轮廓`);
    assert.ok(outline.length >= 4, `${code} 的轮廓点太少，画不出形状`);
    assert.equal(Math.max(...outline.map(([x]) => x)), WING_TIP_X, `${code} 的翼尖没有探到 ${WING_TIP_X} 格`);
    const key = outline.map((point) => point.join(',')).join('|');
    assert.ok(!seen.has(key), `${code} 和 ${seen.get(key)} 是同一条轮廓`);
    seen.set(key, code);
    assert.equal(wingIcon(code).panels.length, 2, `${code} 该画出左右两片翼面`);
  }
});

test('轮廓都不自交：翼面不能打结或翻面', () => {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const proper = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (const [code, outline] of Object.entries(WING_OUTLINES)) {
    const n = outline.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 2; j < n; j += 1) {
        if (i === 0 && j === n - 1) continue;
        assert.ok(
          !proper(outline[i], outline[(i + 1) % n], outline[j], outline[(j + 1) % n]),
          `${code} 的轮廓在第 ${i} 段和第 ${j} 段自己穿过了自己`,
        );
      }
    }
  }
});

test('族名和火力对得上：形状不是随手画的', () => {
  const aimOf = (bolt) => Math.abs(Math.atan2(bolt.vx ?? 0, -(bolt.vy ?? -1)));
  const reachOf = (bolt) => Math.hypot(bolt.vx ?? 0, bolt.vy ?? 0) * (bolt.life ?? 1);
  for (const [code, spec] of Object.entries(WINGS)) {
    const family = WING_FAMILY[code];
    assert.ok(family, `${code} 没有归属的族`);
    const aims = spec.volley.map(aimOf);
    if (family === 'ring') assert.ok((spec.orbs ?? 0) > 0, `${code} 是环族却不带铁球`);
    if (family === 'pylon') assert.ok(spec.volley.some((bolt) => bolt.ground), `${code} 是挂架族却没挂炸弹`);
    if (family === 'needle') {
      assert.equal(spec.volley.length, 1, `${code} 是针翼却不止一根管子`);
      const [bolt] = spec.volley;
      assert.ok(bolt.pierce === 'armor' || bolt.kind === 'beam' || bolt.well, `${code} 的针翼没有一根重管`);
    }
    if (family === 'swept') assert.ok(Math.max(...spec.volley.map(reachOf)) < 24, `${code} 是贴脸族却射得很远`);
    if (family === 'twin') assert.ok(Math.max(...aims) > (2 * Math.PI) / 3, `${code} 是前后族却没有向后的火力`);
    if (family === 'fan') assert.ok(spec.volley.length >= 3 && Math.max(...aims) >= Math.PI / 6, `${code} 是扇族却不散开`);
    if (family === 'straight') assert.ok(spec.volley.length >= 3 && Math.max(...aims) < Math.PI / 6, `${code} 是平直族却带角度`);
  }
});

test('翼尖装置一型一件：图上和场上用的是同一份数据', () => {
  const kinds = new Set(['none', 'winglet', 'blade', 'pod', 'canard', 'fin', 'spike']);
  for (const code of Object.keys(WINGS)) {
    const trim = wingTrim(WINGS[code]);
    assert.ok(kinds.has(trim.tip), `${code} 的翼尖装置 ${trim.tip} 不存在`);
    const icon = wingIcon(code);
    assert.deepEqual(icon.trim, trim, `${code} 的小图和模型用的不是同一件装置`);
    const drawn = icon.fins.length + icon.pods.length;
    assert.ok(drawn >= (trim.tip === 'none' ? 0 : 2), `${code} 的翼尖装置没有画在两片翼上`);
  }
  assert.equal(wingTrim(WINGS.C).tip, 'winglet', '加农的翼尖小翼丢了');
  assert.ok(wingIcon('C').fins.length >= 2, 'C 的翼尖小翼该画成翼尖上的短线');
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

