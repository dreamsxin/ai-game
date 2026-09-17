// 机器人。它不是难度旋钮的装饰，而是这套规则的第二个玩家：
// playthrough.test.js 让同一个大脑（skill=1）替人跑完八关，
// 所以任何一次改判定、改数值，只要把「会算退路的对手」变成过不去的墙，测试就会红。
//
// 大脑只有三件事，按这个顺序：
// 1. 脚下要炸了吗——要炸就只做一件事：跑到一个「我到得了、且到的时候还不炸」的格子。
// 2. 能不能补刀——对手已经是水泡了，补一发就是清掉一个人，优先级高于拆箱和刷装备。
// 3. 其余时间去拆箱刷装备，顺手把对手往墙角挤。
//
// 档位（skill）不改变移动速度，只改变三件事：想得多快、算不算退路、挣脱有多快。
// 所以低档机器人是**会把自己炸掉**的那种笨，而不是走得慢的那种笨——后者不像人。

import {
  BASE_SPEED,
  DIRS,
  FUSE,
  H,
  SPEED_STEP,
  W,
  blastCells,
  cellOf,
  isSolid,
  key,
  manhattan,
} from './rules.js';

const IDLE = { dir: { x: 0, y: 0 }, bomb: false, struggle: false };

/** 一格挡不挡路。自己脚下那发水弹不算障碍，别人的算。 */
function passable(state, self, cx, cy) {
  if (cx <= 0 || cy <= 0 || cx >= W - 1 || cy >= H - 1) return false;
  if (isSolid(state.grid, cx, cy)) return false;
  for (const bomb of state.bombs) {
    if (cellOf(bomb.x) === cx && cellOf(bomb.y) === cy) return bomb.id === self.standing;
  }
  for (const other of state.players) {
    if (other === self || other.state !== 'bubble') continue;
    if (cellOf(other.x) === cx && cellOf(other.y) === cy) return false;
  }
  return true;
}

/**
 * 危险表：每格「还有多少秒会被爆流盖住」。
 * 连锁要算进来——被别人的弹带响的那一发，引信按早的那个算，
 * 不然机器人会躲进一个「看起来还有两秒」的格子里，然后被连锁提前炸到。
 */
export function dangerMap(state) {
  const fuses = state.bombs.map((bomb) => bomb.fuse);
  // 两轮足够把连锁的提前量传开：再深的连锁在 2.4 秒的引信里也排不出来。
  for (let pass = 0; pass < 2; pass += 1) {
    state.bombs.forEach((bomb, index) => {
      const cells = blastCells(state.grid, cellOf(bomb.x), cellOf(bomb.y), bomb.power);
      state.bombs.forEach((other, otherIndex) => {
        if (other === bomb) return;
        const ox = cellOf(other.x);
        const oy = cellOf(other.y);
        if (!cells.some((cell) => cell.cx === ox && cell.cy === oy)) return;
        fuses[otherIndex] = Math.min(fuses[otherIndex], fuses[index]);
      });
    });
  }

  const danger = new Map();
  const mark = (at, time) => {
    const current = danger.get(at);
    if (current === undefined || time < current) danger.set(at, time);
  };
  state.bombs.forEach((bomb, index) => {
    for (const cell of blastCells(state.grid, cellOf(bomb.x), cellOf(bomb.y), bomb.power)) {
      mark(key(cell.cx, cell.cy), Math.max(0, fuses[index]));
    }
  });
  // 已经在场上的爆流是「现在就危险」。
  for (const blast of state.blasts) for (const at of blast.cells) mark(at, 0);
  return danger;
}

const dangerAt = (danger, at) => danger.get(at) ?? Infinity;

/**
 * 从自己脚下做一次广搜，返回每格的步数和回溯表。
 * 走进一格要花的时间按步数折算，所以「来不及跑过去」的格子会被自动排除——
 * 这就是机器人躲弹时不会往死路里钻的原因。
 */
function search(state, self, danger, { margin = 0.2 } = {}) {
  const speed = BASE_SPEED + self.speedLv * SPEED_STEP;
  const start = key(cellOf(self.x), cellOf(self.y));
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const queue = [{ cx: cellOf(self.x), cy: cellOf(self.y), step: 0 }];
  while (queue.length) {
    const cell = queue.shift();
    for (const { dx, dy } of DIRS) {
      const cx = cell.cx + dx;
      const cy = cell.cy + dy;
      const at = key(cx, cy);
      if (dist.has(at) || !passable(state, self, cx, cy)) continue;
      const step = cell.step + 1;
      // 到这一格的时间。到得晚于它开炸的时间就不许走——包括穿过去。
      if (step / speed + margin > dangerAt(danger, at)) continue;
      dist.set(at, step);
      prev.set(at, key(cell.cx, cell.cy));
      queue.push({ cx, cy, step });
    }
  }
  return { dist, prev, start, speed };
}

/** 回溯出下一步该往哪走。返回四向之一，或 null（已经站在目标上）。 */
function stepToward(field, target) {
  let at = target;
  while (prevOf(field, at) !== undefined && prevOf(field, at) !== field.start) at = prevOf(field, at);
  if (at === field.start) return null;
  const cx = at % W;
  const cy = Math.floor(at / W);
  const sx = field.start % W;
  const sy = Math.floor(field.start / W);
  return { x: Math.sign(cx - sx), y: Math.sign(cy - sy) };
}

const prevOf = (field, at) => field.prev.get(at);

/**
 * 找一个避难格：优先「永远不会被炸到」的最近格；实在没有，就取余量最大的那一格。
 * safe=false 意味着「只能拖，拖不掉」——这时候放弹等于自杀，所以放弹前也用这个函数把关。
 */
function refuge(state, self, danger) {
  const field = search(state, self, danger, { margin: 0.12 });
  let best = null;
  let bestStep = Infinity;
  let fallback = null;
  let bestSlack = -Infinity;
  for (const [at, step] of field.dist) {
    const time = dangerAt(danger, at);
    if (time === Infinity) {
      if (step < bestStep) {
        best = at;
        bestStep = step;
      }
      continue;
    }
    const slack = time - step / field.speed;
    if (slack > bestSlack) {
      bestSlack = slack;
      fallback = at;
    }
  }
  const target = best ?? fallback;
  return { field, target, safe: best !== null, dir: target === null ? null : stepToward(field, target) };
}

/** 站在这儿放一发，会盖住哪些格。判定层和这里共用 blastCells，不许各算一份。 */
const reach = (state, self) => blastCells(state.grid, cellOf(self.x), cellOf(self.y), self.power);

const covers = (state, self, cx, cy) => reach(state, self).some((cell) => cell.cx === cx && cell.cy === cy);

/**
 * 放下这一发之后还跑不跑得掉。会算这一步的机器人才像人；
 * 低档机器人按 skill 概率跳过这道检查，于是它们会**把自己裹成水泡**——
 * 这是有意的：笨该体现在决策上，不该体现在手脚慢上。
 */
function canEscape(state, self, danger) {
  const virtual = new Map(danger);
  for (const cell of reach(state, self)) {
    const at = key(cell.cx, cell.cy);
    virtual.set(at, Math.min(dangerAt(virtual, at), FUSE));
  }
  const plan = refuge(state, self, virtual);
  return plan.safe && plan.dir !== null;
}

function nearest(field, accept) {
  let best = null;
  let bestStep = Infinity;
  for (const [at, step] of field.dist) {
    if (step >= bestStep || !accept(at)) continue;
    best = at;
    bestStep = step;
  }
  return best;
}

const neighborCrate = (state, at) => {
  const cx = at % W;
  const cy = Math.floor(at / W);
  return DIRS.some(({ dx, dy }) => {
    const nx = cx + dx;
    const ny = cy + dy;
    return nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && state.grid[key(nx, ny)] === 2;
  });
};

/** 往对手身上挤：在能到的格子里挑一个离最近对手最近的。 */
function hunt(field, foes) {
  let best = null;
  let bestScore = Infinity;
  for (const [at, step] of field.dist) {
    const cx = at % W;
    const cy = Math.floor(at / W);
    let near = Infinity;
    for (const foe of foes) near = Math.min(near, manhattan(cx, cy, cellOf(foe.x), cellOf(foe.y)));
    const score = near * 4 + step * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = at;
    }
  }
  return best;
}

/**
 * 「站到哪儿才打得到它」：最近的一个**开火位**——从那一格放一发，爆流盖得到目标。
 * 补刀非得有这个函数不可：水泡本身是实体，占着的那一格走不进去，
 * 只盯着目标格找路的机器人会当场找不到路，然后转头去拆箱——眼看着一个能清掉的人自己挣脱。
 */
function firingSpot(state, self, field, victims) {
  if (!victims.length) return null;
  const marks = victims.map((victim) => ({ cx: cellOf(victim.x), cy: cellOf(victim.y) }));
  return nearest(field, (at) => {
    const cx = at % W;
    const cy = Math.floor(at / W);
    return blastCells(state.grid, cx, cy, self.power).some((cell) =>
      marks.some((mark) => cell.cx === mark.cx && cell.cy === mark.cy),
    );
  });
}

/**
 * 「这一发下去，它还跑不跑得掉」。用对手的速度和位置跑一遍同样的避难搜索：
 * 找不到安全格就是**封死**了——这是格子对战里唯一稳定的击杀方式，
 * 因为会躲的对手永远躲得开一发放在它旁边的水弹，只躲不开一发堵住退路的。
 */
function trapped(state, self, foe, danger) {
  const virtual = new Map(danger);
  for (const cell of reach(state, self)) {
    const at = key(cell.cx, cell.cy);
    virtual.set(at, Math.min(dangerAt(virtual, at), FUSE));
  }
  return !refuge(state, foe, virtual).safe;
}

/**
 * 生成这一帧的输入。和人走同一个 {dir, bomb, struggle} 结构——
 * 判定层因此不需要知道谁是人谁是机器人，测试也能让这个大脑直接接管玩家。
 */
export function botInput(state, self, dt = 1 / 60) {
  const brain = self.brain;
  if (!brain.dir) brain.dir = { x: 0, y: 0 };

  if (self.state === 'bubble') {
    // 挣脱是连点：档位决定手速，高档几乎是人类极限的连点频率。
    brain.think -= dt;
    if (brain.think > 0) return IDLE;
    brain.think = 0.34 - self.skill * 0.2;
    return { dir: { x: 0, y: 0 }, bomb: false, struggle: true };
  }

  const danger = dangerMap(state);
  const myAt = key(cellOf(self.x), cellOf(self.y));
  brain.think -= dt;

  // 脚下会炸。**注意到**这件事要花时间：档位越低，反应越慢。
  // 这是低档机器人真正的弱点——不是走得慢，而是慢半拍才开始跑。
  if (dangerAt(danger, myAt) !== Infinity) {
    if (brain.alert === undefined || brain.alert === null) brain.alert = (1 - self.skill) * 1.3;
    brain.alert -= dt;
    if (brain.alert > 0) return { dir: brain.dir, bomb: false, struggle: false };
    const plan = refuge(state, self, danger);
    brain.dir = plan.dir ?? { x: 0, y: 0 };
    brain.goal = null;
    return { dir: brain.dir, bomb: false, struggle: false };
  }
  brain.alert = null;

  if (brain.think > 0) return { dir: brain.dir, bomb: false, struggle: false };
  brain.think = 0.2 - self.skill * 0.1;

  const foes = state.players.filter((player) => player !== self && player.state !== 'out');
  const cells = reach(state, self);
  const bubbled = foes.filter((foe) => foe.state === 'bubble');
  const alive = foes.filter((foe) => foe.state === 'alive');
  const close = alive.filter(
    (foe) => manhattan(cellOf(self.x), cellOf(self.y), cellOf(foe.x), cellOf(foe.y)) <= self.power + 3,
  );

  // 补刀优先：水泡会自己挣脱，这一发晚了就白困一场。
  let wantBomb = bubbled.some((foe) => covers(state, self, cellOf(foe.x), cellOf(foe.y)));
  // 封死退路的一发。会躲的对手躲得开放在它旁边的水弹，躲不开堵住出口的那一发。
  if (!wantBomb) wantBomb = close.some((foe) => trapped(state, self, foe, danger));
  if (!wantBomb) wantBomb = alive.some((foe) => covers(state, self, cellOf(foe.x), cellOf(foe.y)));
  // 没人可打就拆箱：箱子后面是道具，也是通路。
  if (!wantBomb) wantBomb = cells.some((cell) => cell.crate);

  if (wantBomb) {
    const careless = state.rng.next() > self.skill * 0.7 + 0.3;
    if (careless || canEscape(state, self, danger)) {
      brain.dir = { x: 0, y: 0 };
      return { dir: brain.dir, bomb: true, struggle: false };
    }
  }

  const field = search(state, self, danger, { margin: 0.35 });
  const armed = self.power >= 2 && self.bombs >= 2;
  let target = null;
  // 补刀的路优先于一切：水泡会自己挣脱，这一趟晚了就白困一场。
  if (bubbled.length) target = firingSpot(state, self, field, bubbled);
  if (target === null && state.drops.length) {
    target = nearest(field, (at) => state.drops.some((drop) => drop.at === at));
  }
  // 装备够了就去打人，还没起来就先拆箱——「什么时候该收手去打」是这游戏的核心节奏。
  if (target === null && armed) target = firingSpot(state, self, field, foes);
  if (target === null) target = nearest(field, (at) => neighborCrate(state, at));
  if (target === null && foes.length) target = firingSpot(state, self, field, foes) ?? hunt(field, foes);
  if (target === null) {
    const options = [...field.dist.keys()];
    target = options[Math.floor(state.rng.next() * options.length)] ?? null;
  }

  brain.goal = target;
  brain.dir = (target === null ? null : stepToward(field, target)) ?? { x: 0, y: 0 };
  return { dir: brain.dir, bomb: false, struggle: false };
}

