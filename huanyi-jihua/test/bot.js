// 一个「会躲、会捡翅膀、会按弱点站位」的机器人。
// 它不是 AI 演示，是关卡难度的守门人：playthrough.test.js 用它跑完 16 关，
// 保证没有哪一关被改成人类过不去的样子，也保证每个 Boss 的血量不是随手填的。
//
// 策略是两个向量相加：躲开威胁的斥力，加上「该站到哪儿」的引力。
// 引力那一项按 Boss 的弱点变形——侧面弱点必须飞到和 Boss 齐平再从旁边打，
// 因为横向飞的子弹追不上头顶上的目标。这条几何关系是「武器即钥匙」的另一半。

import { FIELD_H, FIELD_W, clamp } from '../src/game/rules.js';
import { MAX_TIER, WEAKNESS } from '../src/game/wings.js';

const MAX_DRAG = 1.5;
const IDLE_Y = FIELD_H * 0.8;

/**
 * 这枚机翼道具值不值得去捡。会玩的人不会见什么捡什么：
 * 捡到一个打不进这一关弱点的机翼，等于把手上的钥匙换成一把螺丝刀。
 */
function worthTaking(state, drop) {
  const ship = state.ship;
  if (!ship.wing) return 2;
  // 同型号＝进化。这是最值钱的一种捡。
  if (drop.code === ship.wing) return ship.tier < MAX_TIER ? 3 : 0;
  const keys = WEAKNESS[state.weak]?.keys ?? [];
  const haveKey = keys.includes(ship.wing);
  const dropKey = keys.includes(drop.code);
  if (dropKey && !haveKey) return 2.5;
  return 0;
}

/** Boss 横着走，子弹飞上去要小一秒，所以要打它「将要在」的位置。 */
function leadX(state, boss) {
  const flight = Math.max(0.4, (state.ship.y - boss.y) / 100);
  let x = boss.x + boss.dir * boss.speed * flight;
  const low = boss.w / 2;
  const high = FIELD_W - boss.w / 2;
  if (x < low) x = low + (low - x);
  if (x > high) x = high - (x - high);
  return clamp(x, low, high);
}

/** 这一帧想站到哪儿。 */
function anchor(state) {
  if (state.gate) return { x: state.gate.x, y: state.gate.y + 4, pull: 3.4 };
  // 只去捡值得捡的：宁可不换，也不要把手上的钥匙换成一把螺丝刀。
  const drop = state.drops.find((item) => worthTaking(state, item) > 0);
  if (drop) return { x: drop.x, y: drop.y + 3, pull: worthTaking(state, drop) };
  const boss = state.boss;
  if (!boss) return { x: FIELD_W / 2, y: IDLE_Y, pull: 0.5 };
  if (boss.weak === 'side') {
    // 站在哪一侧要稳住，不能每帧翻来翻去；只有 Boss 快贴墙了才换边。
    const side = boss.x > FIELD_W / 2 ? -1 : 1;
    return { x: clamp(boss.x + side * (boss.w / 2 + 9), 7, FIELD_W - 7), y: boss.y + 2, pull: 1.6 };
  }
  return { x: leadX(state, boss), y: boss.y + 50, pull: 1.4 };
}

/** 生成这一帧的输入。只用拖动，不用键盘——和真实手机操作一致。 */
export function botInput(state) {
  const ship = state.ship;
  let dx = 0;
  let dy = 0;

  // 斥力：按子弹当前速度往前推 0.35 秒，躲的是它要去的地方。
  for (const foe of state.foes) {
    const fx = foe.x + foe.vx * 0.35;
    const fy = foe.y + foe.vy * 0.35;
    const dist = Math.hypot(fx - ship.x, fy - ship.y);
    if (dist > 20 || dist < 0.001) continue;
    const push = ((20 - dist) / 20) * 3.2;
    dx += ((ship.x - fx) / dist) * push;
    dy += ((ship.y - fy) / dist) * push;
  }
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - ship.x, enemy.y - ship.y);
    if (dist > 24 || dist < 0.001) continue;
    const push = ((24 - dist) / 24) * 4.2;
    dx += ((ship.x - enemy.x) / dist) * push;
    dy += ((ship.y - enemy.y) / dist) * push;
  }
  // 不想要的机翼道具也要躲：撞上去会把手上的钥匙换成一把螺丝刀。
  // 换掉的旧翼虽然会原地脱手、还能追回来，但那是一次不必要的险。
  for (const drop of state.drops) {
    if (worthTaking(state, drop) > 0) continue;
    const dist = Math.hypot(drop.x - ship.x, drop.y - ship.y);
    if (dist > 14 || dist < 0.001) continue;
    const push = ((14 - dist) / 14) * 3;
    dx += ((ship.x - drop.x) / dist) * push;
    dy += ((ship.y - drop.y) / dist) * push;
  }

  // 引力：往该站的位置去。
  const goal = anchor(state);
  const gd = Math.hypot(goal.x - ship.x, goal.y - ship.y) || 1;
  dx += ((goal.x - ship.x) / gd) * goal.pull * Math.min(1, gd / 8);
  dy += ((goal.y - ship.y) / gd) * goal.pull * Math.min(1, gd / 8);

  // 别贴边，也别顶到画面最上沿。
  dx += Math.max(0, 9 - ship.x) * 0.35 - Math.max(0, 9 - (FIELD_W - ship.x)) * 0.35;
  dy += Math.max(0, 28 - ship.y) * 0.3 - Math.max(0, 8 - (FIELD_H - ship.y)) * 0.3;

  return {
    jettison: false,
    drag: { dx: clamp(dx, -MAX_DRAG, MAX_DRAG), dy: clamp(dy, -MAX_DRAG, MAX_DRAG) },
    held: { left: false, right: false, up: false, down: false },
  };
}
