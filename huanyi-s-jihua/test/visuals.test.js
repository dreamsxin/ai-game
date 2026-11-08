// 视觉层的测试。这些东西不参与判定，但一样会骗人：
// 1. **看到的宽度必须等于判定的宽度**。翼尖灯、光晕、能量翼都是 Sprite 或加色面片，
//    `Box3` 会把它们算进翼展——摆出去一格，玩家就会按错的宽度躲弹。
//    （Sprite 是有平面几何体的，这一条是实测出来的，不是猜的。）
// 2. **激光得像激光**。L 的冷却 0.05、弹速 190，相邻两发只隔 9.5 格；
//    光束比这个间距短，屏幕上就是一串竖着的短杠——那正是上一版的毛病。
// 3. **开火要看得见**。每一路火力各有一枚独立材质的枪口闪光，
//    共用一份就只能整副翼一起闪，等于看不出是哪一路在打。

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeEscort, makeShip, makeShot, makeWing } from '../src/scene/models.js';
import { WINGS } from '../src/game/wings.js';
import { WING_HALF_W } from '../src/game/rules.js';
import { GEAR_CODES, MAX_FORMATION, escortsOf } from '../src/game/gear.js';

const bounds = (object) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

/** 数一数这一件模型由几层组成：网格与精灵都算。 */
const layers = (object) => {
  let count = 0;
  object.traverse((node) => {
    if (node.isMesh || node.isSprite) count += 1;
  });
  return count;
};

test('每一种我方子弹都是多层叠出来的，不是一根实心棒', () => {
  // 单层实体在加色混合下边缘是硬的：没有外层光晕就没有「在发光」这回事。
  for (const kind of ['pellet', 'beam', 'flame', 'anti', 'shard', 'pierce', 'bomb', 'well']) {
    assert.ok(layers(makeShot(kind)) >= 3, `${kind} 只有 ${layers(makeShot(kind))} 层，光晕或头部闪光缺了`);
  }
});

test('激光的长度盖得住相邻两发的间距：叠起来才是一束连续的光', () => {
  const beam = makeShot('beam');
  const length = beam.userData.core.geometry.parameters.depth;
  const bolt = WINGS.L.volley[0];
  const spacing = Math.hypot(bolt.vx, bolt.vy) * WINGS.L.cool;
  assert.ok(length > spacing * 2, `光束 ${length} 格，相邻两发却隔 ${spacing.toFixed(1)} 格，中间会断`);
  // 普通曳光弹该短就短：它靠的是一发一发数得清，不是连成一条线。
  const pellet = bounds(makeShot('pellet'));
  assert.ok(pellet.max.z - pellet.min.z < length / 3, '普通弹不该跟激光一样长');
});

test('每一路非炸弹火力都有自己的枪口闪光，炸弹没有', () => {
  for (const [code, spec] of Object.entries(WINGS)) {
    const wing = makeWing(code);
    const flashes = wing.userData.muzzles.filter((muzzle) => muzzle.flash);
    const guns = spec.volley.filter((shot) => !shot.ground);
    assert.equal(flashes.length, guns.length, `${code} 有 ${guns.length} 根枪管，闪光却只有 ${flashes.length} 枚`);
    // 材质必须各自一份，共用一份就会整副翼一起闪。
    if (flashes.length > 1) {
      assert.equal(new Set(flashes.map((muzzle) => muzzle.flash.material)).size, flashes.length, `${code} 的枪口闪光共用了材质`);
    }
  }
  const bombs = makeWing('D').userData.muzzles.filter((muzzle) => muzzle.kind === 'bomb');
  assert.equal(bombs.length, 2, 'D 挂着两枚炸弹');
  for (const bomb of bombs) assert.equal(bomb.flash, null, '炸弹没有枪口，别给它安一圈光');
});

test('机翼有后缘灯带与两盏航灯：翼面到哪儿为止、它还活着', () => {
  for (const code of Object.keys(WINGS)) {
    const wing = makeWing(code);
    assert.equal(wing.userData.beacons.length, 2, `${code} 的航灯不是左右各一盏`);
    // 后缘灯带浮在翼面之上（实体翼面占 0.28～0.83），压在里面的那条等于没画。
    const rim = wing.children.filter((node) => node.position.y > 0.85 && node.position.y < 0.9);
    assert.ok(rim.length >= 2, `${code} 找不到贴着后缘的灯带`);
  }
});

test('翼尖光晕不许越出判定翼展：看到的宽度必须等于判定的宽度', () => {
  // models.test 给的是 1.2 格公差（留给翼尖灯条）；这一条更严，管的是「光晕」——
  // 光晕越界比灯条越界恶劣得多，因为它看着就是一块能躲的地方。
  for (const code of Object.keys(WINGS)) {
    const box = bounds(makeWing(code));
    assert.ok(box.max.x <= 6.6, `${code} 的右侧探到 ${box.max.x.toFixed(2)} 格`);
    assert.ok(box.min.x >= -6.6, `${code} 的左侧探到 ${box.min.x.toFixed(2)} 格`);
  }
});

test('机体加了背脊、喷口环与机首传感器，且基准透明度都记下了', () => {
  const ship = makeShip();
  assert.equal(ship.userData.nozzleRings.length, 3, '三个喷口各一圈辉光');
  assert.equal(ship.userData.plumeFires.length, 3, '三层羽流各一组');
  assert.ok(ship.userData.sensorHalo.isSprite, '机首传感器要带一团光晕');
  for (const mat of ship.userData.mats) {
    assert.equal(typeof mat.userData.baseOpacity, 'number', '无敌闪烁要按基准淡出，不能把 0.3 的羽流闪成 1');
  }
});

test('僚机编队整体不越出判定翼展：把模型与光晕都算进去', () => {
  // 上一轮刚修过「Sprite 被 Box3 算进翼展」这个坑；编队挂在主机后侧，
  // 但最外侧那两架的 |dx| 已经到 5.0，模型再宽一点就前功尽弃。
  for (const code of GEAR_CODES) {
    for (let level = 1; level <= MAX_FORMATION; level += 1) {
      const ship = { x: 50, y: 124, gear: code, gearLevel: level };
      for (const escort of escortsOf(ship)) {
        const mesh = makeEscort(code);
        mesh.position.set(escort.x - ship.x, 0, escort.y - ship.y);
        const box = bounds(mesh);
        assert.ok(box.max.x <= WING_HALF_W, `${code} ×${level} 的右侧探到 ${box.max.x.toFixed(2)} 格`);
        assert.ok(box.min.x >= -WING_HALF_W, `${code} ×${level} 的左侧探到 ${box.min.x.toFixed(2)} 格`);
      }
    }
  }
});

test('僚机与装备道具的透明度都按绝对值给：池子复用不会跨帧累积', () => {
  for (const code of GEAR_CODES) {
    const escort = makeEscort(code);
    escort.userData.flash.material.opacity = 0.7;
    escort.userData.flash.scale.setScalar(2.4);
    assert.equal(escort.userData.flash.material.opacity, 0.7);
    assert.equal(escort.userData.flash.scale.x, 2.4, '渲染层每帧用 set 覆盖，不乘法累积');
  }
  const shot = makeShot('escort', '#7fe3ff');
  assert.ok(layers(shot) >= 4, '僚机弹也得是多层叠出来的，不是一根细线');
});
