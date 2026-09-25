// 机身模型的测试。模型是程序生成的，所以它能在 node 里直接造出来量——
// 不用浏览器也能守住两条「画错了就等于骗人」的账：
// 1. 画出来的翼展必须等于判定用的翼展（12.8 格），否则玩家按看到的宽度躲，判定按另一个数算。
// 2. 带翼必须明显比裸机宽——这是「有没有翅膀」这一位信息的全部载体。
//
// 还守一条只会在三维里出事的：**负缩放或转过面的几何体必须用双面材质**。
// 左翼是 scale.x = -1 镜像出来的，而 ExtrudeGeometry 转平之后朝上的是它的背面盖；
// 单面材质下这两片翼会被整片剔掉，斜俯视下就是「战机没有机翼」，而判定里它明明还在。

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeShip } from '../src/scene/models.js';
import { WING_HALF_W } from '../src/game/rules.js';

const spanOf = (object) => {
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

test('画出来的翼展等于判定用的翼展', () => {
  const ship = makeShip();
  const wing = ship.userData.wing;
  const span = spanOf(wing);
  // 翼尖灯比翼面再探出一点点，留一格公差；差一整格就说明两边对不上了。
  assert.ok(
    Math.abs(span.x - WING_HALF_W * 2) < 1.2,
    `翼展 ${span.x.toFixed(2)} 与判定的 ${WING_HALF_W * 2} 差太多`,
  );
});

test('带翼明显比裸机宽：这一位信息全靠它', () => {
  const ship = makeShip();
  const { wing, ring } = ship.userData;
  const armed = spanWithout(ship, [ring]);
  const bare = spanWithout(ship, [ring, wing]);
  assert.ok(armed.x > bare.x * 1.8, `带翼 ${armed.x.toFixed(1)} 必须远宽于裸机 ${bare.x.toFixed(1)}`);
});

test('翻过面和镜像出来的部件一律双面，否则会被整片剔掉', () => {
  const ship = makeShip();
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
  const { wing, tips, pips } = ship.userData;
  assert.ok(wing.children.length >= 4, '两片翼加翼尖灯、挂舱都在这一层');
  assert.equal(tips.length, 2, '两个翼尖灯');
  assert.equal(pips.length, 3, '三颗阶级灯珠');
  // 机身、垂尾、喷口不在机翼层里：弃翼之后还得是一架飞机。
  const bare = spanWithout(ship, [ship.userData.ring, wing]);
  assert.ok(bare.x > 3 && bare.z > 6, `裸机仍该有机身与垂尾，量到 ${JSON.stringify(bare)}`);
});

test('残影与分身用的是同一架飞机的轮廓', () => {
  const ghost = makeShip({ ghost: true });
  assert.ok(ghost.userData.ring.isMesh, '分身也要有护盾环：渲染层对本体和分身走同一套上色逻辑');
  assert.ok(ghost.userData.mats.length > 0, '透明度要能被无敌闪烁改到');
  const span = spanOf(ghost.userData.wing);
  assert.ok(span.x > 10, `分身的翼展也该在 12 格上下，量到 ${span.x.toFixed(1)}`);
});
