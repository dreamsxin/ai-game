// 机器人大脑的单元测试。守的是三条：会躲、不自杀、会补刀。

import test from 'node:test';
import assert from 'node:assert/strict';
import { FUSE, H, TILE, W, centerOf, key } from '../src/game/rules.js';
import { botInput, dangerMap } from '../src/game/bots.js';
import { startGame } from '../src/game/simulation.js';

/** 一张空图：柱子和边墙留着，箱子清掉，位置由测试自己摆。 */
function arena({ bots = 1 } = {}) {
  // 对手数量写在关卡表里，所以要几个对手就得从有那么多对手的那一关起。
  const state = startGame(bots >= 3 ? 4 : bots === 2 ? 2 : 0, 0);
  for (let cy = 1; cy < H - 1; cy += 1) {
    for (let cx = 1; cx < W - 1; cx += 1) {
      if (state.grid[key(cx, cy)] === TILE.CRATE) state.grid[key(cx, cy)] = TILE.FLOOR;
    }
  }
  state.items.clear();
  state.drops.length = 0;
  state.players = state.players.slice(0, bots + 1);
  for (const player of state.players) {
    player.grace = 0;
    player.skill = 1;
    player.brain.think = 0;
  }
  return state;
}

const at = (player, cx, cy) => {
  player.x = centerOf(cx);
  player.y = centerOf(cy);
};

const drop = (state, cx, cy, { power = 1, fuse = FUSE, owner = 1 } = {}) => {
  const bomb = { id: state.nextBomb, x: centerOf(cx), y: centerOf(cy), owner, power, fuse, slide: null };
  state.nextBomb += 1;
  state.bombs.push(bomb);
  return bomb;
};

test('危险表标出十字覆盖，并把连锁的提前量传开', () => {
  const state = arena();
  drop(state, 3, 1, { power: 1, fuse: 0.5 });
  drop(state, 4, 1, { power: 1, fuse: 2.4 });
  const danger = dangerMap(state);

  assert.equal(danger.get(key(3, 1)), 0.5);
  assert.ok(danger.has(key(3, 2)), '爆流盖到的空格也算危险');
  assert.equal(
    danger.get(key(4, 1)),
    0.5,
    '第二发被第一发带响，所以它那一格提前到 0.5 秒——不传这个提前量，机器人会躲进一个「看起来还有两秒」的格子',
  );
  assert.ok(!danger.has(key(7, 7)), '没弹的地方不该被标危险');
});

test('脚下会炸就一定往外走，不会站着等', () => {
  const state = arena();
  const me = state.players[1];
  at(me, 3, 1);
  drop(state, 3, 1, { power: 2, owner: 1, fuse: 2 });
  me.standing = state.bombs[0].id;

  const command = botInput(state, me, 1 / 60);
  assert.equal(command.bomb, false, '躲弹的时候不该再放一发');
  assert.ok(command.dir.x !== 0 || command.dir.y !== 0, '必须开始跑');
});

test('反应有延迟：低档慢半拍才开始跑', () => {
  const build = (skill) => {
    const state = arena();
    const me = state.players[1];
    at(me, 3, 1);
    me.skill = skill;
    drop(state, 3, 1, { power: 2, owner: 1, fuse: 2 });
    me.standing = state.bombs[0].id;
    return { state, me };
  };

  const quick = build(1);
  const first = botInput(quick.state, quick.me, 1 / 60);
  assert.ok(first.dir.x !== 0 || first.dir.y !== 0, '满档当帧就动');

  const slow = build(0.3);
  const late = botInput(slow.state, slow.me, 1 / 60);
  assert.ok(late.dir.x === 0 && late.dir.y === 0, '低档还没反应过来');
});

test('走不出去就不放：满档机器人不会把自己封在死路里', () => {
  const state = arena();
  const me = state.players[1];
  // 挖一条一格宽、两格长的死路，只有一个出口，然后把出口以外全封上。
  for (let cy = 1; cy < H - 1; cy += 1) {
    for (let cx = 1; cx < W - 1; cx += 1) {
      const inside = (cx === 1 && cy <= 3) || (cx === 1 && cy === 4);
      state.grid[key(cx, cy)] = inside ? TILE.FLOOR : TILE.WALL;
    }
  }
  state.grid[key(1, 5)] = TILE.CRATE;
  at(me, 1, 1);
  me.power = 6;

  const command = botInput(state, me, 1 / 60);
  assert.equal(command.bomb, false, '这一发下去自己也跑不掉，不该放');
});

test('对面已经是水泡就补刀，而不是转头去拆箱', () => {
  const state = arena();
  const me = state.players[1];
  const victim = state.players[0];
  at(me, 1, 1);
  at(victim, 2, 1);
  victim.state = 'bubble';
  victim.bubble = 3;
  me.power = 2;
  // 旁边就有箱子，用来验证优先级：补刀该压过拆箱。
  state.grid[key(1, 4)] = TILE.CRATE;

  const command = botInput(state, me, 1 / 60);
  assert.equal(command.bomb, true, '射程里有一颗能补掉的水泡，就该放这一发');
});

test('打不到也不硬放：对手在射程外时先挪位置', () => {
  const state = arena();
  const me = state.players[1];
  const foe = state.players[0];
  at(me, 1, 1);
  at(foe, 9, 11);
  me.power = 1;
  // 图上一个箱子都没有，所以这一帧没有任何该放弹的理由。
  const command = botInput(state, me, 1 / 60);
  assert.equal(command.bomb, false);
  assert.ok(command.dir.x !== 0 || command.dir.y !== 0, '该往对手那边走');
});

test('水泡不是路：机器人不会指望穿过一颗水泡去追人', () => {
  const state = arena({ bots: 2 });
  const me = state.players[1];
  const wall = state.players[2];
  // 把机器人关在一条竖巷里，出口用一颗水泡堵住。
  for (let cy = 1; cy < H - 1; cy += 1) {
    for (let cx = 1; cx < W - 1; cx += 1) {
      state.grid[key(cx, cy)] = cx === 1 && cy <= 4 ? TILE.FLOOR : TILE.WALL;
    }
  }
  at(me, 1, 1);
  at(wall, 1, 2);
  wall.state = 'bubble';
  wall.bubble = 4;
  at(state.players[0], 1, 4);

  const command = botInput(state, me, 1 / 60);
  assert.ok(command.dir.y <= 0, '往下是水泡，走不过去');
});
