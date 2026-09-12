import {
  AIR_ACCEL,
  BRICK_SCORE,
  COIN_SCORE,
  COYOTE_TIME,
  FRICTION,
  GROUND_ACCEL,
  HIGH_BOUNCE,
  HURT_INVULN,
  JUMP_BUFFER,
  JUMP_SPEED,
  MAX_FALL,
  POWER_SCORE,
  SKID_ACCEL,
  SMALL_SIZE,
  STAR_TIME,
  START_LIVES,
  STOMP_BOUNCE,
  jumpGravity,
  resultStars,
  sizeFor,
  speedCap,
  stompScore,
  timeBonus,
} from './rules.js';
import { EMPTY, bumpResult, isBumpable, isCoin, isGoal, isHazard, parseLevel, setTile, tileAt } from './tiles.js';
import { isGrounded, moveBody, overlap } from './physics.js';
import {
  flipEnemy,
  isEnemyThreat,
  isStompable,
  itemReady,
  kickShell,
  spawnEnemy,
  spawnItem,
  standsOnTile,
  stepEnemy,
  stepItem,
  stompEnemy,
} from './entities.js';
import { levelAt, levelCount } from './levels.js';
import { EMPTY_INPUT } from './input.js';

export { EMPTY_INPUT };
export const STEP = 1 / 60;
// 玩家前后这么多格以内的敌人才活动，远处保持静止，玛丽式的「走近才醒」。
const AWAKE_RANGE = 22;
const DEATH_TIME = 1.7;
const CLEAR_TIME = 1.8;

const makePlayer = (spawn) => ({
  x: spawn.x + (1 - SMALL_SIZE.w) / 2,
  y: spawn.y + (1 - SMALL_SIZE.h),
  w: SMALL_SIZE.w,
  h: SMALL_SIZE.h,
  vx: 0,
  vy: 0,
  dir: 1,
  power: 'small',
  grounded: false,
  coyote: 0,
  buffer: 0,
  invuln: 0,
  star: 0,
  jumping: false,
  stompChain: 0,
  run: 0,
});

// 载入一关：字符画解析成网格、敌人布点和出生点，分数与生命由上一关带过来。
function loadLevel(index, carry = {}) {
  const level = levelAt(index);
  const parsed = parseLevel(level.rows);
  let nextId = carry.nextId ?? 1;
  const enemies = parsed.enemies.map((spot) => spawnEnemy(spot, nextId++));
  return {
    status: carry.status ?? 'ready',
    levelIndex: index,
    levelKey: level.key,
    levelName: level.name,
    grid: parsed.grid,
    width: parsed.width,
    height: parsed.height,
    spawn: parsed.spawn,
    player: makePlayer(parsed.spawn),
    enemies,
    items: [],
    effects: [],
    nextId,
    score: carry.score ?? 0,
    coins: carry.coins ?? 0,
    lives: carry.lives ?? START_LIVES,
    timeLeft: level.time,
    elapsed: carry.elapsed ?? 0,
    timer: 0,
    stars: 0,
  };
}

export const createGame = (levelIndex = 0) => loadLevel(levelIndex);

export const startGame = (levelIndex = 0) => ({ ...loadLevel(levelIndex), status: 'playing' });

export const togglePause = (state) => {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
};

// 受伤：大身体先缩小并进入无敌，小身体直接进入死亡演出。
function hurtPlayer(state, effects) {
  const { player } = state;
  if (player.star > 0 || player.invuln > 0) return state;
  if (player.power !== 'small') {
    effects.push({ type: 'shrink', x: player.x, y: player.y });
    return {
      ...state,
      player: {
        ...player,
        power: 'small',
        w: SMALL_SIZE.w,
        h: SMALL_SIZE.h,
        y: player.y + player.h - SMALL_SIZE.h,
        invuln: HURT_INVULN,
      },
    };
  }
  effects.push({ type: 'die', x: player.x, y: player.y });
  return { ...state, status: 'dying', timer: DEATH_TIME, player: { ...player, vx: 0, vy: -11, invuln: 0, star: 0 } };
}

// 顶到块：问号块出道具、砖块碎掉，站在块上的敌人被顶翻。
function bumpBlock(state, bumped, effects) {
  const tile = tileAt(state.grid, bumped.col, bumped.row);
  if (!isBumpable(tile)) return state;
  const result = bumpResult(tile);
  let next = { ...state, grid: setTile(state.grid, bumped.col, bumped.row, result.tile) };
  effects.push({ type: result.tile === EMPTY ? 'brick' : 'bump', x: bumped.col, y: bumped.row });

  if (result.tile === EMPTY) next = { ...next, score: next.score + BRICK_SCORE };
  if (result.item === 'coin') {
    effects.push({ type: 'coin', x: bumped.col, y: bumped.row - 1 });
    next = { ...next, coins: next.coins + 1, score: next.score + COIN_SCORE };
  } else if (result.item) {
    const item = spawnItem(result.item, bumped.col, bumped.row, next.nextId);
    next = { ...next, items: [...next.items, item], nextId: next.nextId + 1 };
  }

  next = {
    ...next,
    enemies: next.enemies.map((enemy) =>
      (isEnemyThreat(enemy) && standsOnTile(enemy, bumped.col, bumped.row) ? flipEnemy(enemy) : enemy)),
  };
  return next;
}

// 滑行的壳会把路上的敌人一起撞飞，连锁得分和踩敌人共用一套计数。
function shellHits(enemies, effects) {
  let killed = 0;
  const next = enemies.map((enemy) => enemy);
  for (const shell of next) {
    if (shell.state !== 'sliding') continue;
    for (let i = 0; i < next.length; i += 1) {
      const other = next[i];
      if (other.id === shell.id || !isEnemyThreat(other) || other.state === 'sliding') continue;
      if (!overlap(shell, other)) continue;
      next[i] = flipEnemy(other);
      killed += 1;
      effects.push({ type: 'kick', x: other.x, y: other.y });
    }
  }
  return { enemies: next, killed };
}

// 玩家撞敌人：从上方踩下去是击杀，站着的壳会被踢出去，其余情况是受伤。
function playerHits(state, prevPlayer, effects) {
  let next = state;
  const enemies = [...next.enemies];
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i];
    if (enemy.state === 'dead' || enemy.state === 'flip') continue;
    if (!overlap(next.player, enemy)) continue;

    if (next.player.star > 0) {
      enemies[i] = flipEnemy(enemy);
      const chain = next.player.stompChain + 1;
      next = { ...next, score: next.score + stompScore(chain), player: { ...next.player, stompChain: chain } };
      effects.push({ type: 'kick', x: enemy.x, y: enemy.y });
      continue;
    }

    const feetBefore = prevPlayer.y + prevPlayer.h;
    const fromAbove = next.player.vy > 0 && feetBefore <= enemy.y + enemy.h * 0.5;
    if (fromAbove && isStompable(enemy)) {
      enemies[i] = stompEnemy(enemy);
      const chain = next.player.stompChain + 1;
      // 踩的瞬间还按着跳，就弹得更高，这是连踩的关键。
      const high = next.player.buffer > 0 || next.player.jumping;
      next = {
        ...next,
        score: next.score + stompScore(chain),
        player: {
          ...next.player,
          y: enemy.y - next.player.h,
          vy: -(high ? HIGH_BOUNCE : STOMP_BOUNCE),
          stompChain: chain,
          jumping: high,
        },
      };
      effects.push({ type: 'stomp', x: enemy.x, y: enemy.y, chain });

      continue;
    }

    if (enemy.state === 'shell') {
      const dir = next.player.x + next.player.w / 2 < enemy.x + enemy.w / 2 ? 1 : -1;
      enemies[i] = kickShell(enemy, dir);
      next = { ...next, score: next.score + BRICK_SCORE };
      effects.push({ type: 'kick', x: enemy.x, y: enemy.y });
      continue;
    }

    next = hurtPlayer({ ...next, enemies }, effects);
    if (next.status === 'dying') return next;
  }
  return { ...next, enemies };
}

// 吃到蘑菇长大（脚不动、头往上顶），吃到星星进入短暂无敌。
function takeItems(state, effects) {
  let next = state;
  const kept = [];
  for (const item of next.items) {
    if (itemReady(item) && overlap(next.player, item)) {
      if (item.kind === 'star') {
        next = { ...next, player: { ...next.player, star: STAR_TIME }, score: next.score + POWER_SCORE };
        effects.push({ type: 'star', x: item.x, y: item.y });
        continue;
      }
      const size = sizeFor('big');
      next = {
        ...next,
        score: next.score + POWER_SCORE,
        player: {
          ...next.player,
          power: 'big',
          w: size.w,
          h: size.h,
          y: next.player.y + next.player.h - size.h,
        },
      };
      effects.push({ type: 'grow', x: item.x, y: item.y });
      continue;
    }
    kept.push(item);
  }
  return { ...next, items: kept };
}

// 掉出关卡底部直接死，无敌状态也不例外。
const fellOut = (state) => state.player.y > state.height + 1.5;

// 死亡演出结束：还有命就在出生点重开本关，没命就是 game over。
function afterDeath(state) {
  const lives = state.lives - 1;
  if (lives <= 0) {
    return { ...state, status: 'over', lives: 0, stars: resultStars(state.score), effects: [] };
  }
  return loadLevel(state.levelIndex, {
    status: 'playing',
    score: state.score,
    coins: state.coins,
    lives,
    elapsed: state.elapsed,
    nextId: state.nextId,
  });
}

// 过关演出结束：进下一关，最后一关通关就是全线通关。
function afterClear(state) {
  const nextIndex = state.levelIndex + 1;
  if (nextIndex >= levelCount) {
    return { ...state, status: 'won', stars: resultStars(state.score), effects: [] };
  }
  return loadLevel(nextIndex, {
    status: 'playing',
    score: state.score,
    coins: state.coins,
    lives: state.lives,
    elapsed: state.elapsed,
    nextId: state.nextId,
  });
}

// 掉坑和超时不看体型，直接进入死亡演出。
function killPlayer(state, reason, effects) {
  effects.push({ type: 'die', x: state.player.x, y: state.player.y, reason });
  return { ...state, status: 'dying', timer: DEATH_TIME, player: { ...state.player, vx: 0, vy: -11, star: 0 } };
}

const settled = (enemy, height) =>
  !((enemy.state === 'dead' || enemy.state === 'flip') && enemy.timer <= 0) && enemy.y < height + 2;

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status === 'dying') {
    const timer = state.timer - dt;
    // 死亡演出：往上一跳再落下去，这段时间不参与碰撞。
    const vy = Math.min(state.player.vy + 46 * dt, MAX_FALL);
    const player = { ...state.player, y: state.player.y + vy * dt, vy };
    if (timer <= 0) return afterDeath({ ...state, player });
    return { ...state, player, timer, effects: [] };
  }
  if (state.status === 'clear') {
    const timer = state.timer - dt;
    if (timer <= 0) return afterClear(state);
    return { ...state, timer, effects: [] };
  }
  if (state.status !== 'playing') return state;

  const effects = [];
  const prevPlayer = state.player;
  let next = {
    ...state,
    effects: [],
    elapsed: state.elapsed + dt,
    timeLeft: Math.max(0, state.timeLeft - dt),
  };

  next = stepPlayer(next, input, dt, effects);
  if (next.status === 'playing') next = touchTiles(next, effects);

  if (next.status === 'playing') {
    const px = next.player.x;
    const stepped = next.enemies.map((enemy) => {
      if (!enemy.awake && Math.abs(enemy.x - px) > AWAKE_RANGE) return enemy;
      return stepEnemy(next.grid, { ...enemy, awake: true }, dt);
    });
    const hits = shellHits(stepped, effects);
    next = { ...next, enemies: hits.enemies, score: next.score + hits.killed * stompScore(2) };
    next = playerHits(next, prevPlayer, effects);
  }

  if (next.status === 'playing') {
    next = { ...next, items: next.items.map((item) => stepItem(next.grid, item, dt)) };
    next = takeItems(next, effects);
  }

  if (next.status === 'playing' && fellOut(next)) next = killPlayer(next, 'pit', effects);
  if (next.status === 'playing' && next.timeLeft <= 0) next = killPlayer(next, 'time', effects);

  return {
    ...next,
    enemies: next.enemies.filter((enemy) => settled(enemy, next.height)),
    items: next.items.filter((item) => item.y < next.height + 2),
    effects,
  };
}



// 玩家身体覆盖到的瓦片：金币收进口袋，尖刺扣一次血，旗杆直接过关。
function touchTiles(state, effects) {
  const { player } = state;
  const left = Math.floor(player.x);
  const right = Math.floor(player.x + player.w - 1e-6);
  const top = Math.floor(player.y);
  const bottom = Math.floor(player.y + player.h - 1e-6);
  let next = state;
  let hazard = false;
  let goal = false;

  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      const tile = tileAt(next.grid, col, row);
      if (isCoin(tile)) {
        next = {
          ...next,
          grid: setTile(next.grid, col, row, EMPTY),
          coins: next.coins + 1,
          score: next.score + COIN_SCORE,
        };
        effects.push({ type: 'coin', x: col, y: row });
      } else if (isHazard(tile)) {
        hazard = true;
      } else if (isGoal(tile)) {
        goal = true;
      }
    }
  }

  if (goal) return clearLevel(next, effects);
  if (hazard) return hurtPlayer(next, effects);
  return next;
}

// 过关：把剩余时间折成分数，播一段结算演出再进下一关。
function clearLevel(state, effects) {
  if (state.status !== 'playing') return state;
  const bonus = timeBonus(state.timeLeft);
  effects.push({ type: 'clear', x: state.player.x, y: state.player.y });
  return { ...state, status: 'clear', timer: CLEAR_TIME, score: state.score + bonus, bonus };
}

// 跑跳的全部手感都在这一段：加速、刹车、土狼时间、跳跃缓冲、可变跳跃高度。
function stepPlayer(state, input, dt, effects) {
  const player = state.player;
  const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  const grounded = player.grounded;
  const cap = speedCap(input.held.run);
  let vx = player.vx;

  if (dir !== 0) {
    const turning = dir * vx < 0;
    const accel = turning ? SKID_ACCEL : (grounded ? GROUND_ACCEL : AIR_ACCEL);
    vx += dir * accel * dt;
  } else if (grounded) {
    const drop = FRICTION * dt;
    vx = Math.abs(vx) <= drop ? 0 : vx - Math.sign(vx) * drop;
  }
  // 松开奔跑键不会瞬间掉速，而是慢慢收回到走路上限，冲刺的惯性得以保留。
  if (Math.abs(vx) > cap) {
    vx = Math.sign(vx) * Math.max(cap, Math.abs(vx) - FRICTION * dt);
  }

  let vy = player.vy;
  let coyote = grounded ? COYOTE_TIME : Math.max(0, player.coyote - dt);
  let buffer = input.jump ? JUMP_BUFFER : Math.max(0, player.buffer - dt);
  let jumping = player.jumping;
  if (buffer > 0 && coyote > 0) {
    vy = -JUMP_SPEED;
    jumping = true;
    buffer = 0;
    coyote = 0;
    effects.push({ type: 'jump', x: player.x, y: player.y });
  }
  vy = Math.min(vy + jumpGravity(vy, input.held.jump && jumping) * dt, MAX_FALL);
  if (vy >= 0) jumping = false;

  const moved = moveBody(state.grid, { ...player, vx, vy }, dt);
  let next = { ...state, player: { ...moved.body } };
  if (moved.bumped) next = bumpBlock(next, moved.bumped, effects);

  const landed = moved.hit.down;
  next = {
    ...next,
    player: {
      ...next.player,
      dir: dir !== 0 ? dir : player.dir,
      grounded: landed || isGrounded(next.grid, next.player),
      coyote,
      buffer,
      jumping,
      invuln: Math.max(0, player.invuln - dt),
      star: Math.max(0, player.star - dt),
      stompChain: landed ? 0 : player.stompChain,
      run: input.held.run && Math.abs(moved.body.vx) > 0.2 ? player.run + dt : 0,
    },
  };
  return next;
}



