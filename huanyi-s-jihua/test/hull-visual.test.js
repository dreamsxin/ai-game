// 机身视觉层：三型必须真的「一型一形」，且卡片图标与场上模型同源。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeShip, makeWing } from '../src/scene/models.js';
import { hullIcon, HULL_ICON } from '../src/scene/hullIcon.js';
import { HULL_SKINS } from '../src/scene/palette.js';
import { HULL_CODES } from '../src/game/hulls.js';

const signature = (ship) => {
  const parts = [];
  ship.traverse((node) => {
    if (!node.isMesh) return;
    const sceneChildren = node.parent?.parent?.children?.length ?? 0;
    parts.push(`${node.geometry.type}:${node.geometry.parameters?.radius ?? node.geometry.parameters?.width?.toFixed(2) ?? ''}@${sceneChildren}`);
  });
  return parts.join(',');
};

const bareSpan = (ship) => {
  ship.updateMatrixWorld(true);
  const skip = new Set();
  ship.userData.ring.traverse((node) => skip.add(node));
  const box = new THREE.Box3();
  ship.traverse((node) => {
    if (node.isMesh && !skip.has(node)) box.expandByObject(node);
  });
  return { x: box.max.x - box.min.x, z: box.max.z - box.min.z };
};

test('三型机身造得出来，各有独立外形，接口一致', () => {
  const seen = new Map();
  for (const code of HULL_CODES) {
    const ship = makeShip({ hull: code });
    assert.equal(typeof ship.userData.hull, 'undefined', '判定字段不进模型 userData，避免两层各存一份');
    assert.ok(ship.userData.wingSlot, `${code} 要有翼挂点`);
    assert.equal(ship.userData.nozzleRings.length, 3, `${code} 仍用同一套喷口同步逻辑`);
    assert.equal(ship.userData.plumeFires.length, 3);
    assert.ok(ship.userData.sensorHalo.isSprite);
    for (const mat of ship.userData.mats) {
      assert.equal(typeof mat.userData.baseOpacity, 'number', `${code} 的材质要记基准透明度`);
    }
    const sig = signature(ship);
    assert.ok(!seen.has(sig), `${code} 与 ${seen.get(sig)} 外形完全一样，等于没做机型选择`);
    seen.set(sig, code);
  }
});

test('三型裸机都收在裸机宽度内，带翼仍明显更宽', () => {
  for (const code of HULL_CODES) {
    const ship = makeShip({ hull: code });
    const bare = bareSpan(ship);
    assert.ok(bare.x > 3 && bare.z > 6, `${code} 裸机尺寸 ${JSON.stringify(bare)}`);
    assert.ok(bare.x < 7, `${code} 裸机撑到 ${bare.x.toFixed(2)} 格，会吃掉「带翼更宽」的信息`);
    ship.userData.wingSlot.add(makeWing('C'));
    const armed = bareSpan(ship);
    assert.ok(armed.x > bare.x * 1.8, `${code} 带翼 ${armed.x.toFixed(2)} / 裸机 ${bare.x.toFixed(2)}`);
  }
});

test('H2 蚀影有环形舰桥、尖塔群与外张引擎；H3 游隼是另一套骨架', () => {
  const torusCount = (ship) => {
    let n = 0;
    ship.traverse((node) => { if (node.isMesh && node.geometry.type === 'TorusGeometry') n += 1; });
    return n;
  };
  const h1 = makeShip({ hull: 'H1' });
  const h2 = makeShip({ hull: 'H2' });
  const h3 = makeShip({ hull: 'H3' });
  // H1 已有无敌环 + 三枚喷口辉光环；H2 在此之上多出舰桥外环与内圈亮边。
  const h1Torus = torusCount(h1);
  assert.ok(h1Torus >= 4);
  assert.equal(torusCount(h2), h1Torus + 2, `H2 该多出舰桥双环，实到 ${torusCount(h2)} 圈`);
  let cones = 0;
  h2.traverse((node) => { if (node.isMesh && node.geometry.type === 'ConeGeometry') cones += 1; });
  assert.ok(cones >= 2, 'H2 该有外张引擎的焰口');
  let h2Mats = 0;
  let h3Mats = 0;
  h2.traverse((node) => { if (node.isMesh) h2Mats += 1; });
  h3.traverse((node) => { if (node.isMesh) h3Mats += 1; });
  assert.ok(h2Mats > h1.userData.mats.length, 'H2 的部件明显更多');
  assert.ok(h3Mats > h1.userData.mats.length, 'H3 露出的骨架也是真几何');
  assert.notEqual(torusCount(h3), torusCount(h2), 'H3 不该抄 H2 的舰桥环');
});

test('残影按机型换轮廓，但仍保持半透明单一材质', () => {
  for (const code of HULL_CODES) {
    const ghost = makeShip({ ghost: true, hull: code });
    assert.ok(ghost.userData.ghost);
    assert.ok(ghost.userData.ring.isMesh);
    const mats = new Set();
    ghost.traverse((node) => { if (node.isMesh) mats.add(node.material); });
    assert.ok(mats.size <= 3, `${code} 分身不该带着一整套实体材质`);
  }
});

test('2D 图标三型各画各的，且都落在 64×52 画框内', () => {
  const sigs = new Set();
  for (const code of HULL_CODES) {
    const art = hullIcon(code);
    assert.equal(art.box.w, HULL_ICON.w);
    assert.equal(art.box.h, HULL_ICON.h);
    assert.ok(art.body, `${code} 要有壳体轮廓`);
    assert.ok(art.engines.length >= 2, `${code} 要有可见引擎`);
    sigs.add(JSON.stringify(art.body + art.tail.map((t) => t.x2).join()));
    for (const band of art.bands) {
      assert.ok(band.x1 >= 0 && band.x1 <= HULL_ICON.w);
      assert.ok(band.y1 >= 0 && band.y1 <= HULL_ICON.h);
    }
    for (const engine of art.engines) {
      assert.ok(engine.x - engine.r >= 0 && engine.x + engine.r <= HULL_ICON.w);
      assert.ok(engine.y + engine.flare <= HULL_ICON.h + 3, `${code} 的尾焰别画到框外`);
    }
  }
  assert.equal(sigs.size, HULL_CODES.length, '三型图标不能长得一样');
  assert.ok(hullIcon('H2').bridge, 'H2 图标要画出舰桥环');
  assert.equal(hullIcon('H1').bridge, null, 'H1 没有舰桥环');
  assert.ok(hullIcon('H3').fins.length >= 2, 'H3 图标要画出外露骨架');
});

test('图标配色与三型模型共用同一份皮肤', () => {
  for (const code of HULL_CODES) {
    const art = hullIcon(code);
    assert.equal(art.skin, HULL_SKINS[code]);
  }
  const edges = HULL_CODES.map((code) => HULL_SKINS[code].edge);
  assert.equal(new Set(edges).size, 3, '三型的识别边条色必须两两不同');
});
