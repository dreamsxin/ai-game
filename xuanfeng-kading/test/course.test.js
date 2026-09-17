// 赛道几何。这层错了后面全错：里程 s 是计圈、名次、机器人前瞻的共同基准，
// 所以「等弧长」和「投影」这两件事必须逐米对得上。

import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACING, buildCourse } from '../src/game/course.js';

const course = buildCourse({ radius: 90, harmonics: [{ k: 4, amp: 0.08 }], width: 26 });

test('中心线是闭合的：最后一节接回第一节，间距和别处一样', () => {
  const first = course.nodes[0];
  const last = course.nodes[course.count - 1];
  const gap = Math.hypot(first.x - last.x, first.y - last.y);
  assert.ok(Math.abs(gap - course.step) < course.step * 0.2, `首尾间距 ${gap.toFixed(2)}，节距 ${course.step.toFixed(2)}`);
});

test('节点是等弧长的：任意相邻两节的间距都贴着节距', () => {
  for (let i = 0; i < course.count; i += 1) {
    const a = course.node(i);
    const b = course.node(i + 1);
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(Math.abs(gap - course.step) < course.step * 0.06, `第 ${i} 节间距 ${gap.toFixed(3)}`);
  }
  assert.ok(Math.abs(course.step - SPACING) < SPACING * 0.5);
});

test('投影：路肩上的点报出正确的横向偏移，左正右负', () => {
  const node = course.node(40);
  const nx = -Math.sin(node.heading);
  const ny = Math.cos(node.heading);
  const left = course.project(node.x + nx * 7, node.y + ny * 7, 40);
  const right = course.project(node.x - nx * 7, node.y - ny * 7, 40);
  assert.ok(Math.abs(left.lateral - 7) < 0.5, `左偏 7 米报成 ${left.lateral.toFixed(2)}`);
  assert.ok(Math.abs(right.lateral + 7) < 0.5, `右偏 7 米报成 ${right.lateral.toFixed(2)}`);
  assert.ok(Math.abs(left.s - node.s) < 1, `里程漂了 ${(left.s - node.s).toFixed(2)} 米`);
});

test('投影给不给 hint 都得到同一个答案', () => {
  for (const index of [0, 17, 63, course.count - 5]) {
    const node = course.node(index);
    const blind = course.project(node.x, node.y);
    const hinted = course.project(node.x, node.y, index);
    assert.equal(blind.index, hinted.index);
  }
});

test('前瞻曲率取的是窗口里最紧的那一段', () => {
  const s = 120;
  const ahead = course.curvatureAhead(s, 30);
  let worst = 0;
  for (let d = 0; d <= 30; d += course.step) {
    const curv = course.curvatureAt(s + d);
    if (Math.abs(curv) > Math.abs(worst)) worst = curv;
  }
  assert.equal(ahead, worst);
});

test('里程绕圈：走满一圈回到原点，负数也折得回来', () => {
  assert.ok(Math.abs(course.wrapS(course.length) - 0) < 1e-6);
  assert.ok(Math.abs(course.wrapS(-1) - (course.length - 1)) < 1e-6);
  const a = course.pointAt(50);
  const b = course.pointAt(50 + course.length);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
});

test('谐波越猛，弯越紧：振幅翻倍则最小弯心半径变小', () => {
  const gentle = buildCourse({ radius: 90, harmonics: [{ k: 4, amp: 0.04 }], width: 26 });
  const sharp = buildCourse({ radius: 90, harmonics: [{ k: 4, amp: 0.12 }], width: 26 });
  assert.ok(sharp.minRadius < gentle.minRadius, `${sharp.minRadius.toFixed(1)} 应该小于 ${gentle.minRadius.toFixed(1)}`);
  assert.ok(sharp.meanCurv > gentle.meanCurv);
});
