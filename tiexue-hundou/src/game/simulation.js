import {
  AIR_ACCEL,
  AMMO_MAX,
  AWAKE_RANGE,
  BOSS_RANGE,
  BOSS_SCORE,
  CLEAR_TIME,
  COYOTE_TIME,
  DEATH_TIME,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_BUFFER,
  JUMP_SPEED,
  MAX_FALL,
  MOVE_MAX,
  PICKUP_SCORE,
  RELOAD_FILL,
  RESPAWN_INVULN,
  STAND_SIZE,
  START_LIVES,
  WEAK_SCORE,
  chainBonus,
  jumpGravity,
  refundFor,
  reloadRate,
  resultStars,
  sizeFor,
  timeBonus,
} from './rules.js';
import { isHazard, parseLevel, tileAt } from './tiles.js';
import { bulletBlocked, isGrounded, moveBody, overlap, solidAt } from './physics.js';
import {
  centerOf,
  enemySpec,
  spawnBoss,
  spawnEnemy,
  spawnPickup,
  spawnPod,
  stepBoss,
  stepEnemy,
  stepPickup,
  weakBox,
} from './entities.js';
import { BASE_WEAPON, aimVector, dropFor, shotsFor, weaponAt } from './weapons.js';
import { levelAt, levelCount } from './levels.js';
import { EMPTY_INPUT } from './input.js';

export { EMPTY_INPUT };
export const STEP = 1 / 60;
// 连续命中的链子：这么久没再打中就断。链子断掉只是少拿分，打在装甲上才是立刻清零。
const CHAIN_HOLD = 1.2;
const BULLET_BOX = 0.24;

const makePlayer = (spawn, mag = AMMO_MAX) => ({

  x: spawn.x + (1 - STAND_SIZE.w) / 2,
  y: spawn.y + (1 - STAND_SIZE.h),
  w: STAND_SIZE.w,
  h: STAND_SIZE.h,
  vx: 0,
  vy: 0,
  dir: 1,
  // 瞄准方向每帧都算出来存着：开火要用，画枪口和准星也要用。
  ax: 1,
  ay: 0,

  grounded: false,
  prone: false,
  coyote: 0,
  buffer: 0,
  jumping: false,
  invuln: RESPAWN_INVULN,
  weapon: BASE_WEAPON,
  // 开局给满弹匣，重生只给一个底数（见 afterDeath）：
  // 死一次不能变成「白送一管弹药」，否则拿命换弹就成了最优解。
  mag,

  reloading: false,
  reloadAt: 0,
  cool: 0,
  hitChain: 0,
  chainTimer: 0,
  safeX: spawn.x,
  safeY: spawn.y - 1,
});

// 载入一关：字符画解析成网格、兵力布点、补给箱和关末那台机器。分数与生命由上一关带过来。
function loadLevel(index, carry = {}) {
  const level = levelAt(index);
  const parsed = parseLevel(level.rows);
  let nextId = carry.nextId ?? 1;
  const enemies = parsed.enemies.map((spot) => spawnEnemy(spot, nextId++));
  const pods = parsed.pods.map((spot, i) => spawnPod(spot, nextId++, dropFor(i + index)));
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
    pods,
    pickups: [],
    bullets: [],
    boss: parsed.boss ? spawnBoss(parsed.boss, level.bossHp) : null,
    effects: [],
    nextId,
    score: carry.score ?? 0,
    lives: carry.lives ?? START_LIVES,
    timeLeft: level.time,
    elapsed: carry.elapsed ?? 0,
    timer: 0,
    stars: 0,
    // 命中回弹可以整局关掉，用来跑对照组：见 test/economy.test.js。
    refund: carry.refund ?? true,
  };
}

export const createGame = (levelIndex = 0, options = {}) => loadLevel(levelIndex, options);

export const startGame = (levelIndex = 0, options = {}) =>
  loadLevel(levelIndex, { ...options, status: 'playing' });

export const togglePause = (state) => {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
};

const clampMag = (mag) => Math.max(0, Math.min(AMMO_MAX, mag));

// 挨一下就是一条命：这游戏没有血条，只有「还剩几条命」。
function killPlayer(state, effects, reason) {
  if (state.player.invuln > 0 || state.status !== 'playing') return state;
  effects.push({ type: 'die', x: state.player.x, y: state.player.y, reason });
  return {
    ...state,
    status: 'dying',
    timer: DEATH_TIME,
    player: { ...state.player, vx: 0, vy: -9, prone: false, hitChain: 0 },
  };
}

// 站起来要先看头顶有没有地方，否则钢架下面一按上就把人挤进砖里。
function boxFits(grid, box) {
  const left = Math.floor(box.x + 1e-6);
  const right = Math.floor(box.x + box.w - 1e-6);
  const top = Math.floor(box.y + 1e-6);
  const bottom = Math.floor(box.y + box.h - 1e-6);
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      if (solidAt(grid, col, row)) return false;
    }
  }
  return true;
}

/**
 * 玩家这一帧：走位、跳跃、蹲下，以及自动开火与装填。
 *
 * 这游戏没有射击键：站着就一直在打。所以「省弹药」只有一个办法——蹲下停火，
 * 而蹲下就不能动。压上去打、还是趴下来喘一口，是玩家每隔几秒都要做一次的选择。
 */
function stepPlayer(state, input, dt, effects) {
  const player = state.player;
  const gun = weaponAt(player.weapon);
  const wantProne = player.grounded && input.held.down && !input.held.up;
  let prone = wantProne;
  let { x, y, w, h } = player;

  if (prone !== player.prone) {
    const size = sizeFor(prone);
    const nextY = y + h - size.h;
    if (prone || boxFits(state.grid, { x, y: nextY, w: size.w, h: size.h })) {
      y = nextY;
      w = size.w;
      h = size.h;
    } else {
      prone = true;
    }
  }

  const dirInput = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  let vx = player.vx;
  if (prone) {
    vx = 0;
  } else if (dirInput !== 0) {
    vx += dirInput * (player.grounded ? GROUND_ACCEL : AIR_ACCEL) * dt;
    vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, vx));
  } else if (player.grounded) {
    const drop = FRICTION * dt;
    vx = Math.abs(vx) <= drop ? 0 : vx - Math.sign(vx) * drop;
  }

  let vy = player.vy;
  let coyote = player.grounded ? COYOTE_TIME : Math.max(0, player.coyote - dt);
  let buffer = input.jump ? JUMP_BUFFER : Math.max(0, player.buffer - dt);
  let jumping = player.jumping;
  // 按住下键再跳 = 从钢架上漏下去，这是横版射击换层的老手法。
  const dropping = input.held.down && (buffer > 0 || input.held.jump) && player.grounded;
  if (buffer > 0 && coyote > 0 && !dropping) {
    vy = -JUMP_SPEED;
    jumping = true;
    buffer = 0;
    coyote = 0;
    prone = false;
    const size = sizeFor(false);
    if (h !== size.h && boxFits(state.grid, { x, y: y + h - size.h, w: size.w, h: size.h })) {
      y = y + h - size.h;
      w = size.w;
      h = size.h;
    }
    effects.push({ type: 'jump', x, y });
  }
  if (dropping) {
    buffer = 0;
    vy = Math.max(vy, 1.5);
  }
  vy = Math.min(vy + jumpGravity(vy, input.held.jump && jumping) * dt, MAX_FALL);
  if (vy >= 0) jumping = false;

  const moved = moveBody(state.grid, { x, y, w, h, vx, vy }, dt, { dropping });
  const body = moved.body;
  const grounded = moved.hit.down || isGrounded(state.grid, body);
  const dir = dirInput !== 0 ? dirInput : player.dir;
  const chainTimer = Math.max(0, player.chainTimer - dt);
  const aim = aimVector({
    dir,
    up: input.held.up,
    down: input.held.down,
    left: input.held.left,
    right: input.held.right,
    airborne: !grounded,
  });
  return {
    ...state,
    player: {
      ...player,
      ...body,
      dir,
      ax: aim.ax,
      ay: aim.ay,
      grounded,

      prone,
      coyote,
      buffer,
      jumping,
      invuln: Math.max(0, player.invuln - dt),
      cool: Math.max(0, player.cool - dt),
      chainTimer,
      hitChain: chainTimer > 0 ? player.hitChain : 0,
      // 站在实地上的最后一个位置就是重生点，所以死在坑边不会重生到坑里。
      safeX: grounded && !prone ? body.x : player.safeX,
      safeY: grounded && !prone ? body.y : player.safeY,
    },
  };
}

/**
 * 开火与装填。整个游戏的经济都在这里：
 * 弹匣打空只能装回 RELOAD_FILL 发（见 rules.js），要想弹匣接近满只能靠命中回弹。
 * 蹲着停火时装填快 3 倍多——这是唯一的主动喘气手段。
 */
function stepGun(state, input, dt, effects) {
  const player = state.player;
  const gun = weaponAt(player.weapon);
  let { mag, cool, reloading, reloadAt } = player;
  const bullets = [];

  if (reloading) {
    reloadAt += reloadRate(player.prone) * dt;
    if (reloadAt >= 1) {
      // 回弹攒下来的子弹不会被这一次装填吃掉：装填只保证一个底数。
      mag = clampMag(Math.max(mag, RELOAD_FILL));
      reloading = false;
      reloadAt = 0;
      effects.push({ type: 'reload', x: player.x, y: player.y });
    }
  }

  // 蹲下就是主动换弹：停火、趴低、把弹匣补回底数。不蹲的话只有打空才会装填。
  if (player.prone && !reloading && mag < RELOAD_FILL) {
    reloading = true;
    reloadAt = 0;
  }

  const canShoot = !player.prone && !reloading && cool <= 0;
  if (canShoot && mag <= 0) {
    reloading = true;
    reloadAt = 0;
    effects.push({ type: 'dry', x: player.x, y: player.y });
  } else if (canShoot) {
    const { ax, ay } = player;
    const center = centerOf(player);
    const muzzle = { x: center.x + ax * 0.55, y: center.y - 0.08 + ay * 0.55, ax, ay };
    for (const spec of shotsFor(player.weapon, muzzle)) {
      bullets.push({ ...spec, id: 0, life: 1.4 });
    }
    mag = clampMag(mag - gun.cost);
    cool = gun.cd;
    effects.push({ type: 'fire', x: muzzle.x, y: muzzle.y, weapon: gun.key });
    // 打到空仓的那一发要响一声：这是「该找地方喘气了」唯一的提示。
    if (mag <= 0) {
      reloading = true;
      reloadAt = 0;
      effects.push({ type: 'dry', x: player.x, y: player.y });
    }
  }

  let nextId = state.nextId;

  const stamped = bullets.map((bullet) => ({ ...bullet, id: nextId++ }));
  return {
    ...state,
    nextId,
    bullets: [...state.bullets, ...stamped],
    player: { ...player, mag, cool, reloading, reloadAt },
  };
}

/**
 * 子弹这一帧。玩家的子弹打中什么决定回弹多少：
 * 打中兵回 1 发，打中 Boss 张开的核心舱回 2 发，打在它的装甲上一发不回、还把连击清零。
 * 「打错位置等于白打」这条规则只在这里存在一次。
 */
function stepBullets(state, dt, effects) {
  const enemies = [...state.enemies];
  const pods = [...state.pods];
  let boss = state.boss;
  let score = state.score;
  let mag = state.player.mag;
  let chain = state.player.hitChain;
  let chainTimer = state.player.chainTimer;
  let died = false;
  const kept = [];

  // 命中的统一入口：回弹、连击、加分、音效都从这里出去，免得三处规则各写一遍。
  const land = (kind, at, gain) => {
    if (kind === 'armor') {
      chain = 0;
      chainTimer = 0;
      effects.push({ type: 'armor', x: at.x, y: at.y });
      return;
    }
    chain += 1;
    chainTimer = CHAIN_HOLD;
    if (state.refund) mag = clampMag(mag + refundFor(kind));
    score += gain + chainBonus(chain);
    effects.push({ type: kind === 'weak' ? 'weak' : 'hit', x: at.x, y: at.y, chain });
  };

  for (const bullet of state.bullets) {
    const life = bullet.life - dt;
    if (life <= 0) continue;
    let alive = true;
    let pierce = bullet.pierce;
    let cur = { ...bullet, life };
    // 一帧走 0.7 格，采样两次就够：只看落点会让子弹从窄目标身上穿过去。
    for (let s = 1; s <= 2 && alive; s += 1) {
      const x = bullet.x + bullet.vx * dt * (s / 2);
      const y = bullet.y + bullet.vy * dt * (s / 2);
      cur = { ...cur, x, y };
      if (x < -1 || x > state.width + 1 || y < -1 || y > state.height + 1) {
        alive = false;
        break;
      }
      if (bulletBlocked(state.grid, x, y)) {
        effects.push({ type: 'spark', x, y });
        alive = false;
        break;
      }
      const box = { x: x - BULLET_BOX / 2, y: y - BULLET_BOX / 2, w: BULLET_BOX, h: BULLET_BOX };

      if (bullet.owner === 'enemy') {
        if (state.player.invuln <= 0 && overlap(box, state.player)) {
          died = true;
          alive = false;
        }
        continue;
      }

      if (boss && boss.hp > 0 && overlap(box, boss)) {
        if (boss.open && overlap(box, weakBox(boss))) {
          boss = { ...boss, hp: Math.max(0, boss.hp - bullet.dmg), flash: 0.12 };
          land('weak', { x, y }, WEAK_SCORE);
        } else {
          land('armor', { x, y });
        }
        alive = false;
        break;
      }

      let struck = false;
      for (let i = 0; i < enemies.length && !struck; i += 1) {
        const enemy = enemies[i];
        if (!overlap(box, enemy)) continue;
        struck = true;
        const hp = enemy.hp - bullet.dmg;
        if (hp <= 0) {
          enemies.splice(i, 1);
          land('hit', { x, y }, enemySpec(enemy.kind).score);
          effects.push({ type: 'kill', x: enemy.x, y: enemy.y, kind: enemy.kind });
        } else {
          enemies[i] = { ...enemy, hp, flash: 0.1 };
          land('hit', { x, y }, 0);
        }
      }
      if (struck) {
        if (pierce <= 0) {
          alive = false;
          break;
        }
        pierce -= 1;
        cur = { ...cur, pierce };
        continue;
      }

      for (let i = 0; i < pods.length; i += 1) {
        if (!overlap(box, pods[i])) continue;
        const pod = pods[i];
        pods.splice(i, 1);
        effects.push({ type: 'crack', x: pod.x, y: pod.y, drop: pod.drop });
        alive = false;
        break;
      }
    }
    if (alive) kept.push(cur);
  }

  const next = {
    ...state,
    bullets: kept,
    enemies,
    pods,
    boss,
    score,
    player: { ...state.player, mag, hitChain: chain, chainTimer },
  };
  return died ? killPlayer(next, effects, 'shot') : next;
}

// 兵力这一帧：只有玩家附近的敌人醒着，Boss 要等玩家走进 BOSS_RANGE 才开机。
function stepFoes(state, dt, effects) {
  const px = state.player.x;
  const enemies = [];
  const shots = [];
  for (const enemy of state.enemies) {
    if (!enemy.awake && Math.abs(enemy.x - px) > AWAKE_RANGE) {
      enemies.push(enemy);
      continue;
    }
    const out = stepEnemy(state.grid, { ...enemy, awake: true }, dt, {
      player: state.player,
      gravity: GRAVITY,
    });
    enemies.push(out.enemy);
    shots.push(...out.shots);
  }

  let boss = state.boss;
  if (boss && boss.hp > 0) {
    const active = boss.active || px > boss.x - BOSS_RANGE;
    if (active) {
      const out = stepBoss({ ...boss, active: true }, dt, { player: state.player });
      boss = out.boss;
      shots.push(...out.shots);
    }
  }

  let nextId = state.nextId;
  const bullets = shots.map((shot) => ({ ...shot, id: nextId++, life: 2.6 }));
  return { ...state, enemies, boss, nextId, bullets: [...state.bullets, ...bullets] };
}

// 贴上来就是一条命：冲锋兵不开枪，靠的就是这条。Boss 的本体同样碰不得。
function touchFoes(state, effects) {
  if (state.player.invuln > 0) return state;
  for (const enemy of state.enemies) {
    if (enemy.awake && overlap(state.player, enemy)) return killPlayer(state, effects, 'touch');
  }
  if (state.boss && state.boss.hp > 0 && state.boss.active && overlap(state.player, state.boss)) {
    return killPlayer(state, effects, 'touch');
  }
  return state;
}

// 水和坑底不讲道理：碰到就是一条命，无敌时间也救不了。
function touchTiles(state, effects) {
  const { player } = state;
  if (player.y > state.height + 1.5) {
    return killPlayer({ ...state, player: { ...player, invuln: 0 } }, effects, 'pit');
  }
  const left = Math.floor(player.x);
  const right = Math.floor(player.x + player.w - 1e-6);
  const bottom = Math.floor(player.y + player.h - 1e-6);
  for (let col = left; col <= right; col += 1) {
    if (isHazard(tileAt(state.grid, col, bottom))) {
      return killPlayer({ ...state, player: { ...player, invuln: 0 } }, effects, 'water');
    }
  }
  return state;
}

// 补给箱碎了掉一件东西；掉落物落地后等人来捡，捡不到就过期。
function stepDrops(state, dt, effects) {
  let nextId = state.nextId;
  const spawned = effects
    .filter((effect) => effect.type === 'crack')
    .map((effect) => spawnPickup(effect.drop, effect.x, effect.y, nextId++));

  let player = state.player;
  let score = state.score;
  const kept = [];
  for (const raw of [...state.pickups, ...spawned]) {
    const pickup = stepPickup(state.grid, raw, dt, GRAVITY);
    if (pickup.life <= 0) continue;
    if (overlap(pickup, player)) {
      score += PICKUP_SCORE;
      if (pickup.kind === 'ammo') {
        player = { ...player, mag: AMMO_MAX, reloading: false, reloadAt: 0 };
      } else {
        // 换枪不附赠弹药：新枪也得自己从命中里养活自己。
        player = { ...player, weapon: pickup.kind };
      }
      effects.push({ type: 'pickup', x: pickup.x, y: pickup.y, kind: pickup.kind });
      continue;
    }
    kept.push(pickup);
  }
  return { ...state, pickups: kept, player, score, nextId };
}

// Boss 倒下就是过关：剩余时间折成分数，放一段结算演出再进下一关。
function clearLevel(state, effects) {
  effects.push({ type: 'clear', x: state.boss.x, y: state.boss.y });
  return {
    ...state,
    status: 'clear',
    timer: CLEAR_TIME,
    score: state.score + BOSS_SCORE + timeBonus(state.timeLeft),
    bullets: [],
  };
}

// 死亡演出结束：还有命就在最后站稳的那块地上重生，枪掉回制式步枪——换来的火力是一次投资。
function afterDeath(state) {
  const lives = state.lives - 1;
  if (lives <= 0) {
    return { ...state, status: 'over', lives: 0, stars: resultStars(state.score), effects: [] };
  }
  const spawn = {
    x: Math.round(state.player.safeX),
    y: Math.round(state.player.safeY + STAND_SIZE.h - 1),
  };
  return {
    ...state,
    status: 'playing',
    lives,
    // 重生那一刻清屏：不清的话上一条命留下的弹幕会把新的一条命立刻收掉。
    bullets: [],
    player: makePlayer(spawn, RELOAD_FILL),
    effects: [],
  };
}


// 过关演出结束：进下一关，最后一关打完就是全线通关。
function afterClear(state) {
  const nextIndex = state.levelIndex + 1;
  if (nextIndex >= levelCount) {
    return { ...state, status: 'won', stars: resultStars(state.score), effects: [] };
  }
  return loadLevel(nextIndex, {
    status: 'playing',
    score: state.score,
    lives: state.lives,
    elapsed: state.elapsed,
    nextId: state.nextId,
    refund: state.refund,
  });
}

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status === 'dying') {
    const timer = state.timer - dt;
    const vy = Math.min(state.player.vy + GRAVITY * dt, MAX_FALL);
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
  let next = {
    ...state,
    effects: [],
    elapsed: state.elapsed + dt,
    timeLeft: Math.max(0, state.timeLeft - dt),
  };

  next = stepPlayer(next, input, dt, effects);
  next = stepGun(next, input, dt, effects);
  next = stepFoes(next, dt, effects);
  next = stepBullets(next, dt, effects);
  if (next.status === 'playing') next = stepDrops(next, dt, effects);
  if (next.status === 'playing') next = touchFoes(next, effects);
  if (next.status === 'playing') next = touchTiles(next, effects);

  // 超时不是掉一条命，是任务失败：这关的兵力和 Boss 都还在原地，重来才有意义。
  if (next.status === 'playing' && next.timeLeft <= 0) {
    return { ...next, status: 'over', stars: resultStars(next.score), effects };
  }
  if (next.status === 'playing' && next.boss && next.boss.hp <= 0) {
    next = clearLevel(next, effects);
  }

  return { ...next, effects };
}






