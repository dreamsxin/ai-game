// 取景的测试。2.5D 的相机摆错不是「不好看」，是上半屏看不见或者远处糊成一团。
// 这两件事都能在没有浏览器的情况下算出来。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALT,
  FIELD_H,
  FOV,
  TILT,
  farNearScale,
  fieldCorners,
  fitView,
  pixelScale,
  project,
  worldZ,
} from '../src/scene/view.js';

const ASPECTS = [0.46, 0.56, 0.62, 0.75, 1, 1.33, 1.78, 2.2];

test('每种屏幕比例下整块场地都在画面内', () => {
  for (const aspect of ASPECTS) {
    const camera = fitView(aspect);
    for (const corner of fieldCorners()) {
      const ndc = project(corner, camera, aspect);
      assert.ok(ndc.depth > 0, `aspect ${aspect} 有角落跑到相机背后`);
      assert.ok(Math.abs(ndc.x) <= 1, `aspect ${aspect} 横向出画：${ndc.x}`);
      assert.ok(Math.abs(ndc.y) <= 1, `aspect ${aspect} 纵向出画：${ndc.y}`);
    }
  }
});

test('取景是贴着边的，不白白拉远', () => {
  for (const aspect of ASPECTS) {
    const camera = fitView(aspect);
    let worst = 0;
    for (const corner of fieldCorners()) {
      const ndc = project(corner, camera, aspect);
      worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y));
    }
    assert.ok(worst > 0.86, `aspect ${aspect} 拉得太远，最远的角只到 ${worst}`);
  }
});

test('往上就是远方：场地顶端在画面上方，而且窄一截', () => {
  const aspect = 0.56;
  const camera = fitView(aspect);
  const far = project({ x: 0, y: ALT.enemy, z: worldZ(0) }, camera, aspect);
  const near = project({ x: 0, y: ALT.enemy, z: worldZ(FIELD_H) }, camera, aspect);
  assert.ok(far.y > near.y, '远端必须画在近端上方');

  const farEdge = project({ x: 50, y: ALT.enemy, z: worldZ(0) }, camera, aspect);
  const nearEdge = project({ x: 50, y: ALT.enemy, z: worldZ(FIELD_H) }, camera, aspect);
  assert.ok(farEdge.x < nearEdge.x * 0.85, '远端的场地宽度必须明显收窄，否则看不出纵深');
});

test('纵深适中：远处小一截但还认得出形状', () => {
  for (const aspect of ASPECTS) {
    const ratio = farNearScale(aspect);
    assert.ok(ratio < 0.85, `aspect ${aspect} 几乎没有纵深：${ratio.toFixed(3)}`);
    assert.ok(ratio > 0.5, `aspect ${aspect} 远处小得看不清：${ratio.toFixed(3)}`);
  }
});

test('抬高一点的东西画在更上面，所以高度读得出来', () => {
  const aspect = 0.62;
  const camera = fitView(aspect);
  const low = project({ x: 0, y: ALT.ground, z: 0 }, camera, aspect);
  const high = project({ x: 0, y: ALT.boss, z: 0 }, camera, aspect);
  assert.ok(high.y > low.y, '贴地的东西必须画得比高空的东西低');
});

test('俯角和视场是定值，改动要一起改测试里的预期', () => {
  assert.equal(TILT, 58);
  assert.equal(FOV, 58);
  const camera = fitView(0.56);
  assert.ok(camera.pos.y > 60, '相机必须在场地上方');
  assert.ok(camera.pos.z > 0, '相机必须在近端这一侧');
});

// 走位是相对拖动，所以「一个像素等于几格」直接决定手感。
// 2.5D 里它不是常数：照平均值算，竖向会比手指慢四成，而且船越往上越粘。
test('拖动换算：船那一处的横竖比例几乎一样，手指怎么动船就怎么动', () => {
  for (const aspect of [0.46, 0.56, 0.75, 1.33]) {
    const width = 900 * aspect;
    const scale = pixelScale(aspect, width, 900, 124);
    const skew = scale.sy / scale.sx;
    assert.ok(skew > 0.9 && skew < 1.15, `aspect ${aspect} 横竖不一致：${skew.toFixed(3)}`);
  }
});

test('拖动换算跟着深度走：船越往远处，一个像素越值钱', () => {
  const scale = (fieldY) => pixelScale(0.56, 504, 900, fieldY);
  const near = scale(144);
  const mid = scale(90);
  const far = scale(30);
  assert.ok(mid.sy > near.sy, '远一点的地方一个像素应该等于更多格');
  assert.ok(far.sy > mid.sy * 1.2, '最远端的换算应该明显更大，否则那一带会拖不动');
});

test('拖动换算明显不同于「场地高 / 画布高」，这就是第一版手感不对的原因', () => {
  const height = 900;
  const scale = pixelScale(0.56, 504, height, 124);
  const naive = FIELD_H / height;
  assert.ok(scale.sy > naive * 1.4, `真实换算 ${scale.sy.toFixed(3)} 应远大于平均值 ${naive.toFixed(3)}`);
});
