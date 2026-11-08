// 接线的测试。判定层有 159 条，但「选了机翼之后游戏真的开始了吗」这条链一直没人守——
// 它跨过判定层与表现层的边界，正是两次黑屏都栽在的地方：
// 一次是 models.js 里重复声明把整层模块搞挂（判定层测试全绿、构建也过，只有开页面才报），
// 一次是 App 的渲染循环没跑起来（面板会关，但世界不动）。
//
// 这一份不需要浏览器：
// 1. 把**每个模块都 import 一遍**——重复声明、坏 import、模块作用域里的 TDZ 全在这一步现形。
// 2. 照 App.jsx 的循环结构在 node 里跑一遍「出击 → 选翼 → 推进」，断言世界真的动了。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STEP, advance, chooseWing, createGame, startGame, step } from '../src/game/simulation.js';
import { EMPTY_INPUT, createInput, mergeInput } from '../src/game/input.js';
import { canSelect } from '../src/game/levels.js';

const MODULES = [
  '../src/game/boss.js',
  '../src/game/enemies.js',
  '../src/game/gear.js',
  '../src/game/input.js',
  '../src/game/levels.js',
  '../src/game/random.js',
  '../src/game/rules.js',
  '../src/game/simulation.js',
  '../src/game/wings.js',
  '../src/scene/audio.js',
  '../src/scene/loop.js',
  '../src/scene/models.js',
  '../src/scene/palette.js',
  '../src/scene/readout.js',
  '../src/scene/render.js',
  '../src/scene/stage.js',
  '../src/scene/view.js',
];

test('每个模块都 import 得进来——重复声明和坏 import 到这一步就该露出来', async () => {
  for (const path of MODULES) {
    await assert.doesNotReject(() => import(path), `${path} 加载失败`);
  }
});

test('表现层对外的口子还在：App.jsx 只认这几个名字', async () => {
  const render = await import('../src/scene/render.js');
  assert.equal(typeof render.createRenderer, 'function');
  const audio = await import('../src/scene/audio.js');
  for (const name of ['createAudio', 'soundsFor', 'vibrationFor', 'winSound']) {
    assert.equal(typeof audio[name], 'function', `audio.js 少了 ${name}`);
  }
});

test('出击 → 选翼 → 世界真的动起来了', () => {
  let game = startGame(0);
  assert.equal(game.status, 'select', '第 1 关是选翼关');
  assert.ok(canSelect(0));

  game = chooseWing(game, 'C');
  assert.equal(game.status, 'playing', '选完机翼就该直接开打');
  assert.equal(game.ship.wing, 'C');

  // 照 App.jsx 的循环推 4 秒：不碰任何输入，自动开火也该把第一波打出分来。
  let notified = 0;
  for (let i = 0; i < Math.round(4 / STEP); i += 1) {
    game = step(game, EMPTY_INPUT, STEP);
    notified += game.effects.length;
  }
  assert.equal(game.status, 'playing');
  assert.ok(game.elapsed > 3.5, `时间必须在走：elapsed=${game.elapsed}`);
  assert.ok(game.enemies.length > 0 || game.kills > 0, '第一波敌人必须已经出场');
  assert.ok(game.shots.length > 0, '火力是自动开的，场上必须有我方子弹');
  assert.ok(notified > 0, 'effects 是表现层与音效的唯一出口，不该一条都不出');
});

test('拖动输入真的能推动战机：这条链断了就是「没法操控」', () => {
  let game = chooseWing(startGame(0), 'C');
  const startX = game.ship.x;
  const drag = { ...EMPTY_INPUT, drag: { dx: -12, dy: -6 } };
  game = step(game, drag, STEP);
  assert.ok(game.ship.x < startX, '往左拖，船必须往左走');
  assert.ok(game.ship.y < 124, '往上拖，船必须往上走');
});

test('关卡推进：clear 之后 advance 能进下一关', () => {
  const game = { ...createGame(0), status: 'clear', levelIndex: 0 };
  const next = advance(game);
  assert.equal(next.levelIndex, 1);
  assert.notEqual(next.status, 'clear');
});

test('输入层与渲染层的接口对得上：scale 注入口收的是 {sx, sy}', () => {
  const handlers = new Map();
  const target = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 700 }),
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
  };
  let askedFor = null;
  const input = createInput(target, {
    keyboard: false,
    scale: () => {
      askedFor = 'called';
      return { sx: 0.3, sy: 0.3 };
    },
  });
  handlers.get('pointerdown')({ pointerId: 1, clientX: 10, clientY: 10 });
  handlers.get('pointermove')({ pointerId: 1, clientX: 20, clientY: 10 });
  const frame = mergeInput(EMPTY_INPUT, input.snapshot());
  assert.equal(askedFor, 'called');
  assert.ok(frame.drag.dx > 0);
});

test('选翼面板预带装备：出击之后僚机真的在场上开火', () => {
  let game = chooseWing(startGame(0), 'C', 'E1');
  assert.equal(game.ship.gear, 'E1');
  assert.equal(game.ship.gearLevel, 1);
  let sawEscortShot = false;
  for (let i = 0; i < 90; i += 1) {
    game = step(game, EMPTY_INPUT, STEP);
    if (game.shots.some((shot) => shot.source === 'gear')) sawEscortShot = true;
  }
  assert.ok(sawEscortShot, '带出去的僚机不能只是 HUD 上的一行字');
  assert.equal(game.status, 'playing');
});

test('僚机不靠一根连线绑在主机上：渲染层没有指挥线对象', () => {
  const source = readFileSync(new URL('../src/scene/render.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('linkMesh') && !source.includes('linkGeo'),
    '三型各自散开之后，连线会把它们重新绑成挂件');
  assert.ok(!source.includes('主机到每架僚机的连线'), '注释里也不该留着旧设计');
  assert.ok(source.includes("shot.homing ? 'cruise' : 'escort'"), '巡航导弹要单独分池');
});

test('暂停面板底部按钮栏随面板宽度收缩，不再向右溢出', () => {
  // 真浏览器里量过：旧写法让「重开本章」吃满整行且不许收缩，320/390/1280 三种宽度
  // 一律溢出面板 66px，「继续」被压到 77px。这类纯 CSS 回归判定层测试盖不到，
  // 只能对着样式表守住那四个关键声明。
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const bar = css.match(/\.panel-actions \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.ok(bar.includes('flex-wrap: wrap'), '放不下要能换行，不能硬挤一行');
  assert.ok(/\.panel-actions \.panel-action \{[^}]*width: auto/s.test(css),
    '按钮不能带着 width:100% 进 flex 容器，那会同时成为次键的 flex-basis');
  assert.ok(/flex:\s*2\s+1\s+140px/.test(css) && /flex:\s*1\s+1\s+110px/.test(css),
    '主键与次键都要有可伸缩的弹性基准');
  assert.ok(!/flex:\s*0\s+0\s+auto/.test(css),
    '不许有「不收缩」的动作键把整行撑破面板');
  assert.ok(/\.panel-action \{[^}]*width: 100%/s.test(css),
    '结算面板里那枚独立的「继续推进」仍要吃满宽');
});
