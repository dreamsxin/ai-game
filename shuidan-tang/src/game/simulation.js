// 判定层。没有 DOM、没有 canvas、没有随机数以外的副作用，所以能整局跑在测试里。
//
// 这游戏的身份是**两段式击杀**：水弹的爆流把人裹成水泡，水泡自己会挣脱；
// 想真清掉一个对手，得在它挣脱前再补一发。于是每一发水弹都同时是攻击和倒计时——
// 你困住了它，也把自己钉在了它旁边等那 4.2 秒。
//
// 另外三条贯穿全局的规矩：
// 1. 水泡是**实体**，堵在巷口就是一面临时的墙——困人也可能反过来堵住自己的退路。
// 2. 箱子既是掩体也是装备来源，拆箱这一个动作同时在开路和刷装备。
// 3. 爆流会连锁引爆，所以「多放几发」在这游戏里不是叠加伤害，而是叠加不可控。

import { createRandom } from './random.js';
import { LEVEL_COUNT, SPAWNS, buildLevel, levelAt } from './maps.js';
import {
  BASE_SPEED,
  BLAST_LIFE,
  BODY,
  BUBBLE_LIFE,
  FUSE,
  GRACE,
  KICK_SPEED,
  MAX_BOMBS,
  MAX_POWER,
  MAX_SPEED_LV,
  SPEED_STEP,
  STEP,
  STRUGGLE_GAIN,
  TILE,
  blastCells,
  cellOf,
  centerOf,
  clamp,
  isSolid,
  key,
  manhattan,
} from './rules.js';
import { botInput } from './bots.js';

export { STEP };

/** 0 号永远是人。判定里到处要问「这条是不是发生在玩家身上」，写死比传参干净。 */
export const HUMAN = 0;

export const ROSTER = [
  { name: '你', color: '#7fe3ff' },
  { name: '水娃', color: '#ff9f4a' },
  { name: '弹弹', color: '#ff5470' },
  { name: '泡泡', color: '#c8a2ff' },
];

export const SCORE = { crate: 10, item: 20, bubble: 80, pop: 300, clear: 800 };

export const EMPTY_INPUT = { dir: { x: 0, y: 0 }, bomb: false, struggle: false };

const seedFor = (levelIndex, attempt) => (levelIndex * 977 + attempt * 31 + 7) | 0;

function makePlayer(index, level) {
  const spawn = SPAWNS[index];
  return {
    id: index,
    name: ROSTER[index].name,
    color: ROSTER[index].color,
    bot: index !== HUMAN,
    skill: index === HUMAN ? 1 : level.skill,
    x: centerOf(spawn.cx),
    y: centerOf(spawn.cy),
    face: { x: 0, y: 1 },
    power: 1,
    bombs: 1,
    speedLv: 0,
    kick: false,
    state: 'alive',
    bubble: 0,
    grace: GRACE,
    standing: null,
    // 机器人的短期记忆。人也带着这个字段，只是永远为空——省掉一处分支。
    brain: { think: 0, path: [], goal: null, place: false },
  };
}

/**
 * 一局的初始状态。status 为 ready 时场地已经建好，所以开场面板背后就是真图，
 * 玩家在按「开打」之前就能看清这一关的巷子长什么样。
 */
export function createGame(levelIndex = 0, attempt = 0) {
  const level = levelAt(levelIndex);
  const seed = seedFor(levelIndex, attempt);
  const { grid, items } = buildLevel(level, seed);
  return {
    status: 'ready',
    levelIndex,
    levelKey: level.key,
    levelName: level.name,
    attempt,
    seed,
    rng: createRandom(seed ^ 0x5f3a),
    grid,
    items,
    players: Array.from({ length: level.bots + 1 }, (_, index) => makePlayer(index, level)),
    bombs: [],
    blasts: [],
    drops: [],
    effects: [],
    nextBomb: 1,
    time: level.time,
    elapsed: 0,
    score: 0,
    lives: 3,
    kills: 0,
    bubbles: 0,
    crates: 0,
    picks: 0,
    stars: 0,
    totalStars: 0,
    hurried: false,
  };
}

export function startGame(levelIndex = 0, attempt = 0) {
  return { ...createGame(levelIndex, attempt), status: 'playing' };
}

/** 重打本关：换 seed（所以是新图），保留分数和剩余生命。 */
export function retryLevel(state) {
  const next = startGame(state.levelIndex, state.attempt + 1);
  next.score = state.score;
  next.lives = state.lives;
  next.totalStars = state.totalStars;
  return next;
}

/** 过关后推进。第 8 关清完就是 won，不再建下一张图。 */
export function advance(state) {
  if (state.levelIndex + 1 >= LEVEL_COUNT) return { ...state, status: 'won' };
  const next = startGame(state.levelIndex + 1, 0);
  next.score = state.score;
  next.lives = state.lives;
  next.totalStars = state.totalStars;
  return next;
}

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

export const cellOfPlayer = (player) => ({ cx: cellOf(player.x), cy: cellOf(player.y) });

export const speedOf = (player) => BASE_SPEED + player.speedLv * SPEED_STEP;

export const bombAt = (state, cx, cy) =>
  state.bombs.find((bomb) => cellOf(bomb.x) === cx && cellOf(bomb.y) === cy) ?? null;

export const liveOf = (state) => state.players.filter((player) => player.state !== 'out');

/**
 * 这一格挡不挡人。除了柱子和箱子，还有两种活的障碍：
 * 水弹（除了自己脚下刚放的那一发）和**水泡**——被困住的人会变成一面临时的墙。
 */
export function blockedFor(state, player, cx, cy) {
  if (isSolid(state.grid, cx, cy)) return true;
  const bomb = bombAt(state, cx, cy);
  if (bomb && bomb.id !== player.standing) return true;
  for (const other of state.players) {
    if (other === player || other.state !== 'bubble') continue;
    if (cellOf(other.x) === cx && cellOf(other.y) === cy) return true;
  }
  return false;
}

/** 沿一个轴推一步，撞上东西就贴着边停下。返回被挡住的那一格（没挡住就是 null）。 */
function slide(state, player, axis, amount) {
  if (!amount) return null;
  const dir = Math.sign(amount);
  const from = axis === 'x' ? player.x : player.y;
  const fromCell = cellOf(from);
  const x = player.x + (axis === 'x' ? amount : 0);
  const y = player.y + (axis === 'x' ? 0 : amount);
  const lead = axis === 'x' ? x + dir * BODY : y + dir * BODY;
  const leadCell = cellOf(lead);
  // 前沿的两个角都要看：只看中线的话，半个身子会插进柱子里。
  const sideLow = axis === 'x' ? cellOf(y - BODY * 0.9) : cellOf(x - BODY * 0.9);
  const sideHigh = axis === 'x' ? cellOf(y + BODY * 0.9) : cellOf(x + BODY * 0.9);
  const hit = axis === 'x'
    ? blockedFor(state, player, leadCell, sideLow) || blockedFor(state, player, leadCell, sideHigh)
    : blockedFor(state, player, sideLow, leadCell) || blockedFor(state, player, sideHigh, leadCell);
  // 身体半径不到半格，所以前沿有时还落在自己这一格里。
  // 这时挡住自己的东西就在脚下（比如刚放下的那发水弹），把人往外推没有意义，也会把人推进墙里。
  if (!hit || leadCell === fromCell) {
    player.x = x;
    player.y = y;
    return hit ? { cx: axis === 'x' ? leadCell : cellOf(x), cy: axis === 'x' ? cellOf(y) : leadCell } : null;
  }
  // 贴边停：停在被挡那一格的外沿，不是原地不动，不然巷口会「弹」一下。
  // 夹一次 min/max，保证这一步只可能让人少走，绝不可能把人往前送或往后甩。
  const edge = dir > 0 ? Math.min(from, leadCell - BODY) : Math.max(from, leadCell + 1 + BODY);
  if (axis === 'x') player.x = edge;
  else player.y = edge;
  return { cx: axis === 'x' ? leadCell : cellOf(x), cy: axis === 'x' ? cellOf(y) : leadCell };
}

/**
 * 走位。四向单轴移动，另一轴自动往巷心归位——
 * 手机上的摇杆给不出像素级对齐，没有这层归位，拐弯十次有三次会卡在柱角上。
 */
function walk(state, player, dir, dt) {
  const speed = speedOf(player);
  if (!dir.x && !dir.y) return null;
  player.face = { x: dir.x, y: dir.y };
  const axis = dir.x ? 'x' : 'y';
  const blocked = slide(state, player, axis, (axis === 'x' ? dir.x : dir.y) * speed * dt);

  // 归位只在垂直轴上做，且只走能走的那一截。
  const otherAxis = axis === 'x' ? 'y' : 'x';
  const pos = otherAxis === 'x' ? player.x : player.y;
  const target = centerOf(cellOf(pos));
  const delta = target - pos;
  if (Math.abs(delta) > 0.002) {
    const step = clamp(delta, -speed * dt * 0.9, speed * dt * 0.9);
    slide(state, player, otherAxis, step);
  }
  return blocked;
}

/** 放一发。放不出来也要给回音——手机上没有回音，玩家会以为是自己没点到。 */
function placeBomb(state, player, effects) {
  const cx = cellOf(player.x);
  const cy = cellOf(player.y);
  const mine = state.bombs.reduce((sum, bomb) => sum + (bomb.owner === player.id ? 1 : 0), 0);
  if (mine >= player.bombs || bombAt(state, cx, cy)) {
    effects.push({ type: 'deny', who: player.id, self: player.id === HUMAN });
    return false;
  }
  const bomb = {
    id: state.nextBomb,
    x: centerOf(cx),
    y: centerOf(cy),
    owner: player.id,
    power: player.power,
    fuse: FUSE,
    slide: null,
  };
  state.nextBomb += 1;
  state.bombs.push(bomb);
  // 刚放的那一发允许自己站着穿出去，不然放完就被自己的弹卡住。
  player.standing = bomb.id;
  effects.push({ type: 'place', who: player.id, cx, cy, self: player.id === HUMAN });
  return true;
}

/** 踢弹：撞在自己的或别人的水弹上，把它顺着走位方向推出去。 */
function tryKick(state, player, dir, blocked, effects) {
  const bomb = bombAt(state, blocked.cx, blocked.cy);
  if (!bomb || bomb.slide) return false;
  const aheadX = blocked.cx + dir.x;
  const aheadY = blocked.cy + dir.y;
  if (isSolid(state.grid, aheadX, aheadY) || bombAt(state, aheadX, aheadY)) return false;
  bomb.slide = { x: dir.x, y: dir.y };
  effects.push({ type: 'kick', who: player.id, self: player.id === HUMAN });
  return true;
}

function pickup(state, player, effects) {
  const cx = cellOf(player.x);
  const cy = cellOf(player.y);
  const index = state.drops.findIndex((drop) => drop.cx === cx && drop.cy === cy);
  if (index < 0) return;
  const [drop] = state.drops.splice(index, 1);
  let code = drop.code;
  // 已经有踢弹了还捡到踢弹，就折成一格压力：不让重复道具变成空捡。
  if (code === 'kick' && player.kick) code = 'power';
  if (code === 'bomb') player.bombs = Math.min(MAX_BOMBS, player.bombs + 1);
  else if (code === 'power') player.power = Math.min(MAX_POWER, player.power + 1);
  else if (code === 'speed') player.speedLv = Math.min(MAX_SPEED_LV, player.speedLv + 1);
  else if (code === 'kick') player.kick = true;
  if (player.id === HUMAN) {
    state.score += SCORE.item;
    state.picks += 1;
  }
  effects.push({ type: 'item', who: player.id, code, cx, cy, self: player.id === HUMAN });
}

function breakCrate(state, cx, cy, owner, effects) {
  const at = key(cx, cy);
  if (state.grid[at] !== TILE.CRATE) return;
  state.grid[at] = TILE.FLOOR;
  const code = state.items.get(at);
  if (code) {
    state.items.delete(at);
    state.drops.push({ at, cx, cy, code });
  }
  if (owner === HUMAN) {
    state.score += SCORE.crate;
    state.crates += 1;
  }
  effects.push({ type: 'crate', cx, cy, owner, item: Boolean(code) });
}

/**
 * 引爆。连锁在同一帧里一次算完：被爆流扫到的水弹立刻加入队列，
 * 所以一串弹爆出来是**一片**爆流，而不是接连几片——玩家看到的和判定算的是同一件事。
 */
function detonate(state, first, effects) {
  const queue = [first];
  const spent = new Set();
  const cells = new Map();
  while (queue.length) {
    const bomb = queue.shift();
    if (spent.has(bomb.id)) continue;
    spent.add(bomb.id);
    const bx = cellOf(bomb.x);
    const by = cellOf(bomb.y);
    for (const cell of blastCells(state.grid, bx, by, bomb.power)) {
      const at = key(cell.cx, cell.cy);
      if (!cells.has(at)) cells.set(at, cell);
      if (cell.crate) breakCrate(state, cell.cx, cell.cy, first.owner, effects);
      const other = bombAt(state, cell.cx, cell.cy);
      if (other && !spent.has(other.id)) queue.push(other);
    }
  }
  state.bombs = state.bombs.filter((bomb) => !spent.has(bomb.id));
  for (const player of state.players) {
    if (player.standing !== null && spent.has(player.standing)) player.standing = null;
  }
  const list = [...cells.values()];
  state.blasts.push({
    cells: new Set(cells.keys()),
    list,
    age: 0,
    life: BLAST_LIFE,
    owner: first.owner,
    hit: new Set(),
  });
  effects.push({ type: 'blast', owner: first.owner, cells: list, chain: spent.size });
}

function updateBombs(state, effects, dt) {
  for (const bomb of [...state.bombs]) {
    if (bomb.slide) {
      const nx = bomb.x + bomb.slide.x * KICK_SPEED * dt;
      const ny = bomb.y + bomb.slide.y * KICK_SPEED * dt;
      const aheadX = cellOf(nx + bomb.slide.x * 0.5);
      const aheadY = cellOf(ny + bomb.slide.y * 0.5);
      const occupied = state.players.some(
        (player) => player.state !== 'out' && cellOf(player.x) === aheadX && cellOf(player.y) === aheadY,
      );
      const other = bombAt(state, aheadX, aheadY);
      if (isSolid(state.grid, aheadX, aheadY) || occupied || (other && other.id !== bomb.id)) {
        bomb.x = centerOf(cellOf(bomb.x));
        bomb.y = centerOf(cellOf(bomb.y));
        bomb.slide = null;
      } else {
        bomb.x = nx;
        bomb.y = ny;
      }
    }
    bomb.fuse -= dt;
  }
  // 引信到点的按放置顺序引爆，连锁在 detonate 里一次算完。
  for (const bomb of [...state.bombs]) {
    if (bomb.fuse <= 0 && state.bombs.includes(bomb)) detonate(state, bomb, effects);
  }
}

/**
 * 中招判定。同一片爆流对同一个人只算一次（hit 集合），
 * 所以「被裹成水泡」和「水泡被打破」不可能在一发弹里同时发生——
 * 补刀必须是真的第二发，这条是两段式击杀的底线。
 */
function strike(state, blast, player, effects) {
  if (player.state === 'alive') {
    if (player.grace > 0) return;
    player.state = 'bubble';
    player.bubble = BUBBLE_LIFE;
    player.standing = null;
    if (blast.owner === HUMAN && player.id !== HUMAN) {
      state.score += SCORE.bubble;
      state.bubbles += 1;
    }
    effects.push({ type: 'bubble', victim: player.id, owner: blast.owner, self: player.id === HUMAN });
    return;
  }
  if (player.state === 'bubble') {
    player.state = 'out';
    if (blast.owner === HUMAN && player.id !== HUMAN) {
      state.score += SCORE.pop;
      state.kills += 1;
    }
    effects.push({ type: 'pop', victim: player.id, owner: blast.owner, self: player.id === HUMAN });
  }
}

function updateBlasts(state, effects, dt) {
  for (const blast of state.blasts) {
    blast.age += dt;
    for (const player of state.players) {
      if (player.state === 'out' || blast.hit.has(player.id)) continue;
      const at = key(cellOf(player.x), cellOf(player.y));
      if (!blast.cells.has(at)) continue;
      blast.hit.add(player.id);
      strike(state, blast, player, effects);
    }
  }
  state.blasts = state.blasts.filter((blast) => blast.age < blast.life);
}

/** 时间越剩越多星。星星在这游戏里衡量的是「有没有主动打」，不是有没有活着熬完。 */
export function starsFor(state) {
  const ratio = state.time / levelAt(state.levelIndex).time;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function settle(state, effects) {
  const human = state.players[HUMAN];
  if (human.state === 'out') {
    state.lives -= 1;
    state.status = state.lives > 0 ? 'down' : 'over';
    effects.push({ type: 'die', self: true });
    return;
  }
  const rivals = state.players.some((player) => player.id !== HUMAN && player.state !== 'out');
  if (!rivals) {
    state.stars = starsFor(state);
    state.totalStars += state.stars;
    state.score += SCORE.clear + Math.round(state.time) * 5;
    state.status = 'clear';
    effects.push({ type: 'clear', stars: state.stars });
    return;
  }
  if (state.time <= 0) {
    // 时间到不是平局：这游戏的失败条件之一就是「没能在限时内清场」，
    // 不然最优策略会退化成蹲在角落等对手自己炸死。
    state.lives -= 1;
    state.status = state.lives > 0 ? 'down' : 'over';
    effects.push({ type: 'timeup', self: true });
  }
}

/**
 * 推进一帧。`input` 有两种形态：
 * - 一个 {dir, bomb, struggle}：驱动玩家，其余角色现场自己想（正常玩的时候走这条）；
 * - 一个数组：按 id 逐个指定，缺的按空输入。测试要「冻住某个对手」或者
 *   让同一个大脑同时接管四个人时走这条，不必给判定层塞测试专用开关。
 *
 * 返回的是同一个 state 对象（原地推进）——一局里每帧都克隆一张 11×13 的图和四个角色，
 * 在手机上是白扔的开销。要快照就自己深拷。
 */
export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing') return state;
  const effects = [];
  state.effects = effects;
  state.elapsed += dt;
  state.time = Math.max(0, state.time - dt);
  if (!state.hurried && state.time <= 20) {
    state.hurried = true;
    effects.push({ type: 'hurry' });
  }

  const scripted = Array.isArray(input);
  for (const player of state.players) {
    if (player.state === 'out') continue;
    const command = scripted
      ? input[player.id] ?? EMPTY_INPUT
      : player.bot
        ? botInput(state, player, dt)
        : input;

    if (player.state === 'bubble') {
      // 连点抵扣挣脱时间：手速能换回一点时间，但换不回站位。
      player.bubble -= dt + (command.struggle ? STRUGGLE_GAIN : 0);
      if (player.bubble <= 0) {
        player.state = 'alive';
        player.bubble = 0;
        player.grace = GRACE;
        effects.push({ type: 'escape', who: player.id, self: player.id === HUMAN });
      }
      continue;
    }

    player.grace = Math.max(0, player.grace - dt);
    const blocked = walk(state, player, command.dir, dt);
    if (player.standing !== null) {
      const own = state.bombs.find((bomb) => bomb.id === player.standing);
      const off = !own || cellOf(own.x) !== cellOf(player.x) || cellOf(own.y) !== cellOf(player.y);
      if (off) player.standing = null;
    }
    if (blocked && player.kick && (command.dir.x || command.dir.y)) {
      tryKick(state, player, command.dir, blocked, effects);
    }
    if (command.bomb) placeBomb(state, player, effects);
    pickup(state, player, effects);
  }

  updateBombs(state, effects, dt);
  updateBlasts(state, effects, dt);
  settle(state, effects);
  return state;
}

/** 给渲染和机器人共用的只读视图：这一格现在危险吗。 */
export function blastingAt(state, cx, cy) {
  const at = key(cx, cy);
  return state.blasts.some((blast) => blast.cells.has(at));
}

/** 玩家离最近的对手有多远。readout 用它提示「有人贴上来了」。 */
export function nearestRival(state) {
  const human = state.players[HUMAN];
  let best = Infinity;
  for (const player of state.players) {
    if (player.id === HUMAN || player.state === 'out') continue;
    best = Math.min(best, manhattan(cellOf(human.x), cellOf(human.y), cellOf(player.x), cellOf(player.y)));
  }
  return best;
}



