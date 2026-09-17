// 车辆判定。这个文件守的是这游戏的手感契约，一条一条都是玩法主张：
// 不拉手刹不出气、气不够松手就白漂、连喷有窗口、漂得越深越慢、草地上攒气反而在漏。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOST_SPEED,
  COMBO_WINDOW,
  DRIFT_MIN,
  GRASS_SPEED,
  MAX_SPEED,
  SHOULDER,
  STEP,
  TIERS,
  WALL_MIN,
  tierOf,
} from '../src/game/rules.js';
import { buildCourse } from '../src/game/course.js';
import { createKart, placeKart, stepKart } from '../src/game/kart.js';

// 判定用的赛道刻意选了一条**几乎笔直的大环**（半径 400 米）：
// 这里要验的是车本身的规则，赛道弯不弯是 course/tracks 两组测试的事。
// 用缓弯还有一个实际好处：steer=0 跑几秒也不会自己飘出赛道，
// 否则每条断言都要先分辨「这是规则错了还是车跑偏了」。
const course = buildCourse({ radius: 400, harmonics: [], width: 30 });

/** 起步就给一个初速，省得每条断言都先等三秒加速。 */
const fresh = (speed = 0) => {
  const kart = placeKart(createKart({ id: 0, name: '我', color: '#fff', bot: false }), course, 0, 0);
  kart.speed = speed;
  return kart;
};

/** 按住某一套操作跑一段。返回这一段里攒下来的 effects，方便按事件断言。 */
function drive(kart, input, seconds, now = 0) {
  const effects = [];
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    stepKart(kart, input, STEP, course, effects, now + i * STEP);
  }
  return effects;
}

/** 把车横向搬开一段距离，用来构造「压草」和「撞墙」这两种处境。 */
function shift(kart, meters) {
  const node = course.node(kart.node);
  kart.x += -Math.sin(node.heading) * meters;
  kart.y += Math.cos(node.heading) * meters;
}

test('不拉手刹就没有气：一直打方向也攒不出一格', () => {
  const kart = fresh();
  drive(kart, { steer: 1, drift: false, boost: false }, 3);
  assert.equal(kart.charge, 0);
  assert.equal(kart.tokens.length, 0);
  assert.ok(Math.abs(kart.driftAngle) < DRIFT_MIN, `抓地状态下不该有漂移角，实际 ${kart.driftAngle.toFixed(3)}`);
});

test('拉手刹并打方向：车尾甩出来，气跟着涨', () => {
  const kart = fresh();
  drive(kart, { steer: 0, drift: false, boost: false }, 1);
  const effects = drive(kart, { steer: 1, drift: true, boost: false }, 1.2, 1);
  assert.ok(kart.driftAngle > DRIFT_MIN, `漂移角只有 ${kart.driftAngle.toFixed(3)}`);
  assert.ok(kart.charge > TIERS[0], `一秒二的深漂只攒到 ${kart.charge.toFixed(3)}`);
  assert.ok(effects.some((effect) => effect.type === 'tier'), '升档应该有事件');
});

test('松手结账：够一档给一档，不够就白漂', () => {
  const good = fresh();
  drive(good, { steer: 0, drift: false, boost: false }, 1);
  drive(good, { steer: 1, drift: true, boost: false }, 1.2, 1);
  const tier = tierOf(good.charge);
  const settle = drive(good, { steer: 1, drift: false, boost: false }, STEP, 2.2);
  assert.deepEqual(good.tokens, [tier]);
  assert.equal(settle.find((effect) => effect.type === 'ready')?.tier, tier);

  const short = fresh();
  drive(short, { steer: 0, drift: false, boost: false }, 1);
  drive(short, { steer: 1, drift: true, boost: false }, 0.5, 1);
  assert.equal(tierOf(short.charge), 0);
  const wasted = drive(short, { steer: 1, drift: false, boost: false }, STEP, 1.5);
  assert.equal(short.tokens.length, 0);
  assert.ok(wasted.some((effect) => effect.type === 'fizzle'), '白漂了要有一声');
});

test('连喷的窗口内外是两种结果：窗口内带着底气开始，窗口外从零开始', () => {
  const inside = fresh();
  drive(inside, { steer: 0, drift: false, boost: false }, 1);
  drive(inside, { steer: 1, drift: true, boost: false }, 1.2, 1);
  drive(inside, { steer: 1, drift: false, boost: false }, COMBO_WINDOW * 0.4, 2.2);
  const linked = drive(inside, { steer: 1, drift: true, boost: false }, STEP, 2.5);
  assert.equal(inside.chain, 1, '窗口内重新入漂应该算连喷');
  assert.ok(inside.charge > 0.2, `连上的一段该带底气，实际 ${inside.charge.toFixed(3)}`);
  assert.ok(linked.some((effect) => effect.type === 'chain'));

  const late = fresh();
  drive(late, { steer: 0, drift: false, boost: false }, 1);
  drive(late, { steer: 1, drift: true, boost: false }, 1.2, 1);
  drive(late, { steer: 1, drift: false, boost: false }, COMBO_WINDOW + 0.2, 2.2);
  drive(late, { steer: 1, drift: true, boost: false }, STEP, 2.95);
  assert.equal(late.chain, 0, '窗口过了就不算连喷');
  assert.ok(late.charge < 0.1, `断了连喷不该带底气，实际 ${late.charge.toFixed(3)}`);
});

test('喷射把上限抬到抓地之上，喷完自己回落', () => {
  const kart = fresh();
  kart.tokens = [3];
  drive(kart, { steer: 0, drift: false, boost: false }, 2);
  const fired = drive(kart, { steer: 0, drift: false, boost: true }, STEP, 2);
  assert.ok(fired.some((effect) => effect.type === 'boost' && effect.tier === 3));
  drive(kart, { steer: 0, drift: false, boost: false }, 0.6, 2.02);
  assert.ok(kart.speed > MAX_SPEED + 2, `喷射中只跑到 ${kart.speed.toFixed(1)}`);
  assert.ok(kart.speed <= BOOST_SPEED + 0.01);
  drive(kart, { steer: 0, drift: false, boost: false }, 3, 2.7);
  assert.ok(kart.speed <= MAX_SPEED + 0.01, `喷完该落回抓地上限，实际 ${kart.speed.toFixed(1)}`);
});

test('手上没气按喷只有一声空响', () => {
  const kart = fresh();
  const effects = drive(kart, { steer: 0, drift: false, boost: true }, STEP);
  assert.ok(effects.some((effect) => effect.type === 'deny'));
  assert.equal(kart.boostTime, 0);
});

test('草地：上限掉到 GRASS_SPEED，而且在草上漂移是漏气而不是攒气', () => {
  const kart = fresh(30);
  // 往**弯外**挪：这条大环的圆心在车的左手边，所以直着开会一路往外飘，不会自己回到路面上。
  shift(kart, -(course.half + 1.2));
  const entered = drive(kart, { steer: 0, drift: false, boost: false }, 2);
  assert.ok(kart.offTrack, `应该判成压草，横向 ${kart.lateral.toFixed(2)}`);
  assert.ok(entered.some((effect) => effect.type === 'grass'));
  assert.ok(kart.speed <= GRASS_SPEED + 0.5, `草地上还有 ${kart.speed.toFixed(1)}`);

  kart.charge = 0.5;
  drive(kart, { steer: -1, drift: true, boost: false }, 0.25, 2);
  assert.ok(kart.offTrack, '这一段得还在草里，否则测的就不是漏气');
  assert.ok(kart.charge < 0.5, `草地上漂移该漏气，实际 ${kart.charge.toFixed(3)}`);
});

test('撞墙：贴回缓冲带边缘，速度砍半', () => {
  const kart = fresh(30);
  const before = kart.speed;
  shift(kart, course.half + SHOULDER + 3);
  const hit = drive(kart, { steer: 0, drift: false, boost: false }, STEP);
  assert.ok(hit.some((effect) => effect.type === 'wall'));
  assert.ok(kart.speed < before * 0.8, `撞完还有 ${kart.speed.toFixed(1)}，撞前 ${before.toFixed(1)}`);
  assert.ok(Math.abs(kart.lateral) <= course.half + SHOULDER + 0.01);
});

test('漂得越深越慢：满舵漂移的稳定速度低于浅漂', () => {
  const deep = fresh(30);
  drive(deep, { steer: 1, drift: true, boost: false }, 1.5);
  const shallow = fresh(30);
  drive(shallow, { steer: 0.25, drift: true, boost: false }, 1.5);
  assert.ok(deep.speed < shallow.speed, `深漂 ${deep.speed.toFixed(1)} 应该慢于浅漂 ${shallow.speed.toFixed(1)}`);
  assert.ok(deep.charge > shallow.charge, '但深漂该换来更多气');
});

test('尾流：贴在别人后面上限更高', () => {
  const alone = fresh(30);
  const drafting = fresh(30);
  drafting.draft = true;
  drive(alone, { steer: 0, drift: false, boost: false }, 1.5);
  drive(drafting, { steer: 0, drift: false, boost: false }, 1.5);
  assert.ok(drafting.speed > alone.speed + 0.5, `尾流 ${drafting.speed.toFixed(1)} vs 独跑 ${alone.speed.toFixed(1)}`);
});

test('撞墙不会把人钉死：车头被掰进赛道，速度有保底，两秒内能自己开回来', () => {
  const kart = fresh(30);
  shift(kart, -(course.half + SHOULDER + 6));
  // 车头朝着墙外，也就是最糟的姿态。
  kart.heading = course.node(kart.node).heading - 0.5;
  kart.course = kart.heading;
  drive(kart, { steer: 0, drift: false, boost: false }, 2);
  assert.ok(kart.speed >= WALL_MIN, `贴着墙磨了两秒只剩 ${kart.speed.toFixed(1)}，玩家没有倒车键，会被钉死`);
  assert.ok(kart.wallHits <= 8, `两秒撞了 ${kart.wallHits} 次，说明每帧都在重新撞`);
  assert.ok(
    Math.abs(kart.lateral) < course.half + SHOULDER,
    `两秒后还贴在墙上（横向 ${kart.lateral.toFixed(1)}）`,
  );
});

test('计圈：过起跑线那一下不算成绩，跑完一圈才记', () => {
  const kart = fresh();
  const early = drive(kart, { steer: 0, drift: false, boost: false }, 2);
  assert.equal(early.filter((effect) => effect.type === 'lap').length, 0, '刚出发不该记圈');
  assert.equal(kart.lapTimes.length, 0);
  kart.progress = course.length - 0.5;
  const lapped = drive(kart, { steer: 0, drift: false, boost: false }, 0.2, 2);
  assert.equal(lapped.filter((effect) => effect.type === 'lap').length, 1);
  assert.equal(kart.lapTimes.length, 1);
});
