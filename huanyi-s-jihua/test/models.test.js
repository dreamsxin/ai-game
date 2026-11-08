// 机身与机翼模型的测试。模型是程序生成的，所以能在 node 里直接造出来量——
// 不用浏览器也能守住几条「画错了就等于骗人」的账：
// 1. 画出来的翼展必须等于判定用的翼展（12.8 格），否则玩家按看到的宽度躲，判定按另一个数算。
// 2. 带翼必须明显比裸机宽——这是「有没有翅膀」这一位信息的全部载体。
// 3. **换翼必须真的换外形**：炮口数与朝向都从 wings.js 的 volley 长出来，
//    所以「五路扇形」在翼上真有五个朝外的炮口，「前后炮」真有一根朝后的管子。
//    这一条是玩家亲自报的 bug：翼换了而外形没变，等于界面在说谎。
//
// 还守一条只会在三维里出事的：**负缩放或转过面的几何体必须用双面材质**。
// 左翼是 scale.x = -1 镜像出来的，而 ExtrudeGeometry 转平之后朝上的是它的背面盖；
// 单面材质下这两片翼会被整片剔掉，斜俯视下就是「战机没有机翼」，而判定里它明明还在。

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeDrop, makeEscort, makeGearDrop, makeShip, makeShot, makeWing, shadeWing } from '../src/scene/models.js';
import { WING_HALF_W } from '../src/game/rules.js';
import { WINGS } from '../src/game/wings.js';
import { ESCORT_HALF_W, GEAR_CODES } from '../src/game/gear.js';
import { wingProfile, wingTrim } from '../src/scene/wingIcon.js';

const RAD = Math.PI / 180;

const spanOf = (object) => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return { x: box.max.x - box.min.x, z: box.max.z - box.min.z };
};

/**
 * 量尺寸时要把护盾环排除掉：它半径 8.4（比翼展还宽）而且一直挂在机身上，
 * 不排除的话「带翼」和「裸机」量出来是同一个数——`Box3` 不看 visible。
 */
const spanWithout = (ship, excluded) => {
  ship.updateMatrixWorld(true);
  const skip = new Set();
  for (const item of excluded) item.traverse((node) => skip.add(node));
  const box = new THREE.Box3();
  ship.traverse((node) => {
    if (node.isMesh && !skip.has(node)) box.expandByObject(node);
  });
  return { x: box.max.x - box.min.x, z: box.max.z - box.min.z };
};

/** 把一副机翼挂上机身，模拟渲染层的 wingFor。 */
const arm = (ship, code) => {
  const wing = makeWing(code);
  ship.userData.wingSlot.add(wing);
  return wing;
};

test('每一种机翼画出来的翼展都等于判定用的翼展', () => {
  for (const code of Object.keys(WINGS)) {
    const span = spanOf(makeWing(code));
    // 翼尖灯比翼面再探出一点点，留一格公差；差一整格就说明两边对不上了。
    assert.ok(
      Math.abs(span.x - WING_HALF_W * 2) < 1.2,
      `${code} 的翼展 ${span.x.toFixed(2)} 与判定的 ${WING_HALF_W * 2} 差太多`,
    );
  }
});

test('带翼明显比裸机宽：这一位信息全靠它', () => {
  const ship = makeShip();
  const wing = arm(ship, 'C');
  const armed = spanWithout(ship, [ship.userData.ring]);
  const bare = spanWithout(ship, [ship.userData.ring, wing]);
  assert.ok(armed.x > bare.x * 1.8, `带翼 ${armed.x.toFixed(1)} 必须远宽于裸机 ${bare.x.toFixed(1)}`);
});

test('翻过面和镜像出来的部件一律双面，否则会被整片剔掉', () => {
  const ship = makeShip();
  arm(ship, 'W');
  const offenders = [];
  ship.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const mirrored = node.scale.x < 0 || node.scale.y < 0 || node.scale.z < 0;
    if (mirrored && node.material.side !== THREE.DoubleSide) offenders.push(node.geometry.type);
  });
  assert.deepEqual(offenders, [], `这些镜像部件还是单面材质：${offenders.join(', ')}`);
});

test('机翼是单独一层，弃翼只摘这一层', () => {
  const ship = makeShip();
  const wing = arm(ship, 'C');
  assert.equal(ship.userData.wingSlot.children[0], wing, '机翼挂在自己的挂点上，不是拌进机身里');
  assert.equal(wing.userData.tips.length, 2, '两个翼尖灯');
  assert.equal(wing.userData.pips.length, 3, '三颗阶级灯珠');
  // 机身、垂尾、喷口不在机翼层里：弃翼之后还得是一架飞机。
  const bare = spanWithout(ship, [ship.userData.ring, wing]);
  assert.ok(bare.x > 3 && bare.z > 6, `裸机仍该有机身与垂尾，量到 ${JSON.stringify(bare)}`);
});

test('炮口数与朝向照 volley 来：换翼真的换外形', () => {
  for (const [code, spec] of Object.entries(WINGS)) {
    const wing = makeWing(code);
    assert.equal(
      wing.userData.muzzles.length,
      spec.volley.length,
      `${code} 有 ${spec.volley.length} 路火力，翼上却有 ${wing.userData.muzzles.length} 个炮口`,
    );
    for (const [i, muzzle] of wing.userData.muzzles.entries()) {
      const bolt = spec.volley[i];
      const want = Math.atan2(bolt.vx, -bolt.vy);
      assert.ok(
        Math.abs(muzzle.dir - want) < 1e-6,
        `${code} 第 ${i} 个炮口朝 ${(muzzle.dir / RAD).toFixed(1)}°，那一发却朝 ${(want / RAD).toFixed(1)}°`,
      );
    }
  }
});

test('炮口摊在翼展上，而且左右对称', () => {
  // 判定层的 dx 只有 ±1～3 格，照抄会让所有机翼的炮管挤成同一坨——那就等于没换外形。
  for (const [code, spec] of Object.entries(WINGS)) {
    const wing = makeWing(code);
    const seats = wing.userData.muzzles.map((muzzle) => muzzle.mesh.position.x);
    const widest = Math.max(...seats.map(Math.abs));
    const spread = Math.max(...spec.volley.map((bolt) => Math.abs(bolt.dx)));
    if (spread > 0) {
      assert.ok(widest > 3, `${code} 的最外侧炮口只在 ${widest.toFixed(2)} 格，太挤了看不出路数`);
      assert.ok(widest < 6.4, `${code} 的炮口探到 ${widest.toFixed(2)} 格，超出翼展了`);
    }
    // dx 互为相反数的两发，画出来也必须互为相反数。
    for (const [i, bolt] of spec.volley.entries()) {
      const mirror = spec.volley.findIndex((other) => other.dx === -bolt.dx && bolt.dx !== 0);
      if (mirror >= 0) assert.ok(Math.abs(seats[i] + seats[mirror]) < 1e-6, `${code} 的炮口左右不对称`);
    }
  }
});

test('路数越多翼弦越深：两路和五路的轮廓不一样', () => {
  const depth = (code) => {
    const profile = wingProfile(WINGS[code]);
    const zs = profile.map(([, z]) => z);
    return Math.max(...zs) - Math.min(...zs);
  };
  assert.ok(depth('W') > depth('C') * 1.15, '5 路扇形的翼弦要明显比 2 路加农炮深');
});

test('前后炮真有一根朝后的管子，对地机翼真把炸弹挂在翼下', () => {
  const back = makeWing('A').userData.muzzles.find((muzzle) => Math.abs(muzzle.dir) > Math.PI / 2);
  assert.ok(back, 'A 的第二路朝后打，翼上必须有一根朝后的管子');

  const bombs = makeWing('D').userData.muzzles.filter((muzzle) => muzzle.kind === 'bomb');
  assert.equal(bombs.length, 2, 'D 挂两枚炸弹');
  for (const bomb of bombs) assert.ok(bomb.mesh.position.y < 0, '炸弹挂在翼下，不是摆在翼面上');
});

test('21 型 21 种皮：换翼连颜色都不一样', () => {
  // 玩家报过两次「机翼都一样」。上一版按出身只分三色，常规十五型在场上全是同一片蓝。
  const skin = (code) => makeWing(code).userData.mats[0].color.getHexString();
  const all = Object.keys(WINGS).map((code) => [code, skin(code)]);
  for (const [code, hex] of all) assert.equal(hex.length, 6, `${code} 的翼面颜色取不到`);
  const unique = new Set(all.map(([, hex]) => hex));
  assert.equal(unique.size, all.length, `有 ${all.length - unique.size} 型机翼撞了色：${all.map(([, hex]) => hex).join('/')}`);
});

test('翼尖装置按型号挂上去，而且长在翼尖而不是翼根', () => {
  for (const code of Object.keys(WINGS)) {
    const wing = makeWing(code);
    assert.equal(wing.userData.tip, wingTrim(WINGS[code]).tip, `${code} 的翼尖装置没挂上`);
  }
  // C 的翼尖小翼是立起来的一片：轮廓之外唯一高过 1.4 格的东西。
  const tall = [];
  makeWing('C').traverse((node) => {
    if (node.isMesh && node.position.y > 1.4) tall.push(Math.abs(node.position.x));
  });
  assert.ok(tall.length >= 2, 'C 的翼尖小翼该立起来');
  for (const x of tall) assert.ok(x > 5.6, `小翼该长在翼尖，现在在 ${x.toFixed(1)} 格`);
});

test('招牌零件真的挂在翼上：引力井的环、链弧的线圈、量子分身的棱镜', () => {
  // 引力井和链弧的标记写在**子弹**上而不是机翼记录上，按 spec.well 找会一个都找不到。
  const shapes = (code) => {
    const list = [];
    makeWing(code).traverse((node) => {
      if (node.isMesh) list.push(node.geometry.type);
    });
    return list;
  };
  assert.ok(shapes('G').includes('TorusGeometry'), '引力井要有发射环');
  assert.equal(shapes('Z').filter((type) => type === 'TorusGeometry').length, 2, '链弧两枚线圈');
  assert.ok(shapes('Q').includes('OctahedronGeometry'), '量子分身要有棱镜');
  // 原作（B-WINGS 的 H-WING）机翼本身就是两翼端各挂一枚铁球，所以球座画在翼尖。
  const tipBalls = (code) => {
    const list = [];
    makeWing(code).traverse((node) => {
      if (node.isMesh && node.geometry.type === 'SphereGeometry') list.push(Math.abs(node.position.x));
    });
    return list;
  };
  assert.equal(tipBalls('H').length, 2, '铁球炮两枚球座');
  assert.equal(tipBalls('O').length, 4, '护环四枚球座');
  for (const x of tipBalls('H')) assert.ok(x > 4.5, `球座该挂在翼尖，现在在 ${x.toFixed(1)} 格`);
  assert.ok(!shapes('C').includes('TorusGeometry'), '加农炮没有招牌零件，别乱加');
});

test('21 型机翼的翼面几何体各不相同：连轮廓都在说话', () => {
  // 玩家两次报的都是「机翼都一样」，所以这条守的是轮廓本身，而不是炮管数。
  // 比对的是真正送进渲染器的顶点：轮廓差一点点也算换了一型。
  const fingerprint = (code) => {
    const wing = makeWing(code);
    let panel = null;
    wing.traverse((node) => {
      if (node.isMesh && node.material.side === THREE.DoubleSide && !panel) panel = node;
    });
    assert.ok(panel, `${code} 找不到翼面`);
    return Array.from(panel.geometry.attributes.position.array, (value) => value.toFixed(3)).join(',');
  };
  const prints = Object.keys(WINGS).map((code) => [code, fingerprint(code)]);
  const unique = new Set(prints.map(([, print]) => print));
  assert.equal(unique.size, prints.length, `有两种机翼的翼面一模一样：${prints.map(([code]) => code).join('/')}`);
});

test('形状仍然跟着火力走：针翼比扇翼薄，挂架翼后缘开了口', () => {
  const bandAt = (code, x) => {
    const profile = wingProfile(WINGS[code]);
    const zs = profile.filter(([px]) => Math.abs(px - x) < 0.01).map(([, z]) => z);
    return zs.length > 1 ? Math.max(...zs) - Math.min(...zs) : 0;
  };
  assert.ok(bandAt('J', 6.4) < bandAt('W', 6.4) * 0.5, '穿甲的针翼在翼尖该薄成一柄刀');
  const trailing = (code) => Math.max(...wingProfile(WINGS[code]).map(([, z]) => z));
  assert.ok(trailing('D') > trailing('C'), '对地机翼的挂架该往后探出去');
});

test('压暗能还原：同一副翼会在场上被反复压暗和点亮', () => {
  const wing = makeWing('C');
  const mat = wing.userData.mats[0];
  const glow = mat.emissiveIntensity;
  const opacity = mat.opacity;
  shadeWing(wing, true);
  assert.ok(mat.emissiveIntensity < glow, '压暗要真的暗下去');
  shadeWing(wing, false);
  assert.equal(mat.emissiveIntensity, glow, '还原要回到原来的亮度，不能一路越切越暗');
  assert.equal(mat.opacity, opacity);
  shadeWing(wing, true);
  shadeWing(wing, true);
  shadeWing(wing, false);
  assert.equal(mat.emissiveIntensity, glow, '连压两次再还原也得回到原值');
});

test('脱手的道具就是那副机翼本身', () => {
  const drop = makeDrop();
  const { spin, wings } = drop.userData;
  assert.ok(spin, '有一个翻滚用的挂点');
  assert.ok(wings instanceof Map, '按型号缓存机翼模型');
  const wing = makeWing('H');
  spin.add(wing);
  const span = spanOf(drop);
  assert.ok(span.x > 10, `道具上挂的是整副翼（缩放在渲染层做），量到 ${span.x.toFixed(1)}`);
});

test('残影与分身用的是同一架飞机的轮廓', () => {
  const ghost = makeShip({ ghost: true });
  assert.ok(ghost.userData.ring.isMesh, '分身也要有护盾环：渲染层对本体和分身走同一套上色逻辑');
  assert.ok(ghost.userData.mats.length > 0, '透明度要能被无敌闪烁改到');
  assert.ok(ghost.userData.ghost, '渲染层靠这一位决定要不要把翼也套成半透明');
  const span = spanOf(arm(ghost, 'C'));
  assert.ok(span.x > 10, `分身的翼展也该在 12 格上下，量到 ${span.x.toFixed(1)}`);
});

test('三型僚机一型一形一色，半宽连光晕都收在 1.3 格内', () => {
  const seen = [];
  for (const code of GEAR_CODES) {
    const escort = makeEscort(code);
    escort.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(escort); // Sprite 也会被算进来
    const half = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    assert.ok(half <= ESCORT_HALF_W + 0.02, `${code} 半宽 ${half.toFixed(2)} 撑破了 ${ESCORT_HALF_W}`);
    assert.ok(spanOf(escort).z < 7, `${code} 该比主机短一截`);
    assert.ok(escort.userData.flash.isSprite, `${code} 要有自己的炮口闪光`);
    assert.ok(escort.userData.mats.every((mat) => typeof mat.userData.baseOpacity === 'number'));
    seen.push({
      shape: escort.userData.shape,
      color: escort.userData.mats[0].color.getHexString(),
      z: spanOf(escort).z.toFixed(2),
    });
  }
  assert.equal(new Set(seen.map((item) => item.shape)).size, GEAR_CODES.length, '有僚机撞了形状');
  assert.equal(new Set(seen.map((item) => item.color)).size, GEAR_CODES.length, '有僚机撞了色');
  assert.equal(new Set(seen.map((item) => item.z)).size, GEAR_CODES.length, '三型的纵向长度也得不一样');
});

test('装备道具是六边形收纳舱，不是那枚会翻滚的菱形机翼', () => {
  const gear = makeGearDrop();
  const hex = gear.userData.spin.children.find((node) => node.geometry?.type === 'CylinderGeometry');
  assert.equal(hex?.geometry.parameters.radialSegments, 6, '六边形棱柱');
  assert.ok(gear.userData.spin.children.length >= 3, '舱体、外环、核心三层');
  assert.equal(makeDrop().userData.spin.children.length, 0, '机翼道具的翼是渲染层按型号挂上去的');
  assert.ok(gear.userData.halo.isSprite, '装备道具带一圈柔光，远处才认得出');
});

test('僚机弹细一档、短一截：两路火力叠在同一列也分得开', () => {
  const escort = makeShot('escort', '#7fe3ff');
  const plain = makeShot('pellet');
  assert.ok(spanOf(escort).z < spanOf(plain).z, '僚机弹不该和主机弹一样长');
  assert.ok(spanOf(escort).x < spanOf(plain).x, '僚机弹该更细');
  assert.ok(escort.userData.head, '照样要有弹头闪光');
});
