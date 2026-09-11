import {
  ALLY_SPAWNS,
  ENEMY_SPAWNS,
  createArena,
  resolveMove,
  safestSpawn,
} from './arena.js';
import {
  acquireTarget,
  addRecoil,
  angleTo,
  recoverRecoil,
  reticleState,
  shotAngle,
  steerAim,
} from './aim.js';
import { botIntent } from './bots.js';
import { advanceBullets, spawnBullet } from './combat.js';
import { createRandom } from './random.js';
import {
  ACCEL,
  DAMAGE_SCORE,
  FIRE_INTERVAL,
  FOCUS_CHARGE_TIME,
  FOCUS_MOVE_SCALE,
  MAG_SIZE,
  MATCH_SECONDS,
  MAX_HEALTH,
  MOVE_SPEED,
  RELOAD_TIME,
  RESPAWN_DELAY,
  SCORE_LIMIT,
  TEAM_ALLY,
  TEAM_ENEMY,
  aimSpread,
  clamp,
  focusRatio,
  killScore,
} from './rules.js';

export const STEP = 1 / 60;
const KILLFEED_LIFE = 3.4;
const KILLFEED_MAX = 4;

const ROSTER = {
  [TEAM_ALLY]: [
    { name: '你', player: true },
    { name: '阿岚', skill: { aimError: 0.05, reaction: 0.3, trigger: 0.1 } },
    { name: '小舟', skill: { aimError: 0.06, reaction: 0.34, trigger: 0.11 } },
  ],
  [TEAM_ENEMY]: [
    { name: '赤羽', skill: { aimError: 0.045, reaction: 0.28, trigger: 0.09 } },
    { name: '黑刃', skill: { aimError: 0.055, reaction: 0.32, trigger: 0.1 } },
    { name: '灰隼', skill: { aimError: 0.065, reaction: 0.36, trigger: 0.12 } },
  ],
};

const makeUnit = (team, index, entry, spawn, aim) => {
  const skill = entry.skill ?? { aimError: 0.05, reaction: 0.3, trigger: 0.1 };
  return {
    id: `${team}-${index}`,
    team,
    name: entry.name,
    isPlayer: Boolean(entry.player),
    x: spawn.x,
    y: spawn.y,
    aim,
    vx: 0,
    vy: 0,
    health: MAX_HEALTH,
    alive: true,
    respawnIn: 0,
    ammo: MAG_SIZE,
    reloading: 0,
    cooldown: 0,
    recoil: 0,
    focusTime: 0,
    moveRatio: 0,
    kills: 0,
    deaths: 0,
    streak: 0,
    skill,
    // reaction 从满值起算：机器人刚看到人也要顶一下反应时间才开枪。
    brain: {
      memory: null,
      roam: index * 3,
      strafe: 1,
      strafeTimer: 0,
      retarget: 0,
      reaction: skill.reaction,
      error: 0,
    },
  };
};

export function createGame(seed = 1) {
  const arena = createArena();
  const units = [
    ...ROSTER[TEAM_ALLY].map((entry, i) => makeUnit(TEAM_ALLY, i, entry, ALLY_SPAWNS[i], 0)),
    ...ROSTER[TEAM_ENEMY].map((entry, i) => makeUnit(TEAM_ENEMY, i, entry, ENEMY_SPAWNS[i], Math.PI)),
  ];
  const player = units.find((unit) => unit.isPlayer);
  return {
    status: 'ready',
    seed,
    rngState: seed,
    arena,
    units,
    bullets: [],
    nextBulletId: 1,
    effects: [],
    killfeed: [],
    score: { [TEAM_ALLY]: 0, [TEAM_ENEMY]: 0 },
    timeLeft: MATCH_SECONDS,
    elapsed: 0,
    playerId: player.id,
    stats: { kills: 0, deaths: 0, shots: 0, hits: 0, damage: 0, streak: 0, bestStreak: 0, score: 0 },
    reticle: { angle: 0, spread: aimSpread(0), focus: 0, targetId: null, locked: false, tight: 0 },
  };
}

export const startGame = (seed = 1) => ({ ...createGame(seed), status: 'playing' });

export const togglePause = (state) => ({
  ...state,
  status: state.status === 'paused' ? 'playing' : state.status === 'playing' ? 'paused' : state.status,
});

export const playerUnit = (state) => state.units.find((unit) => unit.id === state.playerId);

export const teammates = (state, team) => state.units.filter((unit) => unit.team === team);

export const opponents = (state, team) => state.units.filter((unit) => unit.team !== team);

const EMPTY_INPUT = { move: { x: 0, y: 0 }, aimAngle: null, aimPoint: null, fire: false, focus: false, reload: false };

// 玩家输入转成和机器人同构的意图：摇杆给角度，鼠标给场上一点。
export function playerIntent(unit, input = EMPTY_INPUT) {
  let aimAngle = unit.aim;
  if (typeof input.aimAngle === 'number') {
    aimAngle = input.aimAngle;
  } else if (input.aimPoint) {
    // 准星压在自己身上时保持原方向，否则枪口会乱抖。
    if (Math.hypot(input.aimPoint.x - unit.x, input.aimPoint.y - unit.y) > 0.25) {
      aimAngle = angleTo(unit, input.aimPoint);
    }
  }
  return {
    move: input.move ?? { x: 0, y: 0 },
    aimAngle,
    fire: Boolean(input.fire),
    focus: Boolean(input.focus),
    reload: Boolean(input.reload),
  };
}

// 一个单位的一帧：端稳 → 移动 → 转枪口 → 扳机与弹药。玩家和机器人共用。
export function stepUnit(arena, unit, intent, target, dt, rng, sink) {
  const focusing = intent.focus && unit.reloading === 0;
  const focusTime = focusing
    ? Math.min(FOCUS_CHARGE_TIME, unit.focusTime + dt)
    : Math.max(0, unit.focusTime - dt * 2);
  const ratio = focusRatio(focusTime);

  const speed = MOVE_SPEED * (1 + (FOCUS_MOVE_SCALE - 1) * ratio);
  const limit = ACCEL * dt;
  const vx = unit.vx + clamp(intent.move.x * speed - unit.vx, -limit, limit);
  const vy = unit.vy + clamp(intent.move.y * speed - unit.vy, -limit, limit);
  const moved = resolveMove(arena, unit.x, unit.y, vx * dt, vy * dt);
  const moveRatio = clamp(Math.hypot(vx, vy) / MOVE_SPEED, 0, 1);

  const aimTarget = target ? { ...target, angle: angleTo(moved, target.enemy) } : null;
  const aim = steerAim(unit.aim, intent.aimAngle, aimTarget, dt, ratio);

  let ammo = unit.ammo;
  let reloading = unit.reloading;
  let cooldown = Math.max(0, unit.cooldown - dt);
  let recoil = recoverRecoil(unit.recoil, dt);
  if (reloading > 0) {
    reloading = Math.max(0, reloading - dt);
    if (reloading === 0) ammo = MAG_SIZE;
  } else if (ammo === 0 || (intent.reload && ammo < MAG_SIZE)) {
    reloading = RELOAD_TIME;
  }

  let fired = false;
  if (intent.fire && reloading === 0 && ammo > 0 && cooldown === 0) {
    const spread = aimSpread(recoil, { moving: moveRatio, focus: ratio });
    const angle = shotAngle(aim, spread, rng.signed());
    const bullet = spawnBullet(sink.nextBulletId, { ...unit, x: moved.x, y: moved.y }, angle);
    sink.nextBulletId += 1;
    sink.bullets.push(bullet);
    sink.effects.push({ type: 'shot', x: bullet.x, y: bullet.y, angle, team: unit.team });
    ammo -= 1;
    cooldown = FIRE_INTERVAL;
    recoil = addRecoil(recoil);
    fired = true;
  }

  return {
    unit: { ...unit, x: moved.x, y: moved.y, vx, vy, aim, focusTime, moveRatio, ammo, reloading, cooldown, recoil },
    fired,
  };
}

const respawn = (arena, unit, enemies, effects) => {
  const spawns = unit.team === TEAM_ALLY ? ALLY_SPAWNS : ENEMY_SPAWNS;
  const spot = safestSpawn(arena, spawns, enemies);
  effects.push({ type: 'spawn', x: spot.x, y: spot.y, team: unit.team });
  return {
    ...unit,
    alive: true,
    health: MAX_HEALTH,
    x: spot.x,
    y: spot.y,
    vx: 0,
    vy: 0,
    ammo: MAG_SIZE,
    reloading: 0,
    cooldown: 0,
    recoil: 0,
    focusTime: 0,
    respawnIn: 0,
    brain: { ...unit.brain, memory: null },
  };
};

// 定步长推进：复活 → 意图 → 单位 → 子弹 → 结算。同一个 seed 加同一串输入结果逐字段一致。
export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing') return state;
  const { arena } = state;
  const rng = createRandom(state.seed);
  rng.load(state.rngState);
  const sink = { bullets: [...state.bullets], effects: [], nextBulletId: state.nextBulletId };
  const stats = { ...state.stats };
  const score = { ...state.score };
  const units = [];
  let playerTarget = null;

  for (const unit of state.units) {
    const enemies = state.units.filter((other) => other.team !== unit.team);
    if (!unit.alive) {
      const respawnIn = Math.max(0, unit.respawnIn - dt);
      units.push(respawnIn > 0 ? { ...unit, respawnIn } : respawn(arena, unit, enemies, sink.effects));
      continue;
    }
    let intent;
    let brain = unit.brain;
    let target = null;
    if (unit.isPlayer) {
      intent = playerIntent(unit, input);
      // 只有玩家吃瞄准辅助：机器人有自己的误差模型，再叠软锁就成了枪械大师。
      target = acquireTarget(arena, unit, enemies, unit.aim);
      playerTarget = target;
    } else {
      intent = botIntent(arena, unit, enemies, rng, dt);
      brain = intent.brain;
    }
    const result = stepUnit(arena, { ...unit, brain }, intent, target, dt, rng, sink);
    if (unit.isPlayer && result.fired) stats.shots += 1;
    units.push(result.unit);
  }

  const { bullets, hits, impacts } = advanceBullets(arena, sink.bullets, units, dt);
  for (const impact of impacts) sink.effects.push({ type: 'impact', ...impact });

  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const feed = [];
  for (const hit of hits) {
    const victim = byId.get(hit.targetId);
    if (!victim?.alive) continue;
    const shooter = byId.get(hit.ownerId);
    sink.effects.push({ type: 'hit', x: hit.x, y: hit.y, team: hit.team });
    if (shooter?.isPlayer) {
      stats.hits += 1;
      stats.damage += hit.damage;
      stats.score += hit.damage * DAMAGE_SCORE;
    }
    const health = victim.health - hit.damage;
    if (health > 0) {
      victim.health = health;
      continue;
    }
    victim.alive = false;
    victim.health = 0;
    victim.deaths += 1;
    victim.streak = 0;
    victim.respawnIn = RESPAWN_DELAY;
    victim.vx = 0;
    victim.vy = 0;
    score[hit.team] += 1;
    sink.effects.push({ type: 'kill', x: victim.x, y: victim.y, team: hit.team });
    if (shooter) {
      shooter.kills += 1;
      shooter.streak += 1;
    }
    if (shooter?.isPlayer) {
      stats.kills += 1;
      stats.streak = shooter.streak;
      stats.bestStreak = Math.max(stats.bestStreak, shooter.streak);
      stats.score += killScore(shooter.streak);
    }
    if (victim.isPlayer) {
      stats.deaths += 1;
      stats.streak = 0;
    }
    feed.push({
      id: `${victim.id}@${state.elapsed.toFixed(3)}`,
      killer: shooter?.name ?? '战场',
      victim: victim.name,
      team: hit.team,
      life: KILLFEED_LIFE,
    });
  }

  const killfeed = [
    ...state.killfeed.map((entry) => ({ ...entry, life: entry.life - dt })).filter((entry) => entry.life > 0),
    ...feed,
  ].slice(-KILLFEED_MAX);

  const timeLeft = Math.max(0, state.timeLeft - dt);
  let status = state.status;
  if (score[TEAM_ALLY] >= SCORE_LIMIT || score[TEAM_ENEMY] >= SCORE_LIMIT || timeLeft === 0) {
    status = score[TEAM_ALLY] > score[TEAM_ENEMY] ? 'won' : 'over';
  }

  const player = byId.get(state.playerId);
  const liveTarget = playerTarget && byId.get(playerTarget.enemy.id)?.alive
    ? { ...playerTarget, enemy: byId.get(playerTarget.enemy.id) }
    : null;
  const reticle = player?.alive
    ? reticleState(player, liveTarget)
    : { ...state.reticle, targetId: null, locked: false };

  return {
    ...state,
    status,
    units,
    bullets,
    nextBulletId: sink.nextBulletId,
    effects: sink.effects,
    killfeed,
    score,
    timeLeft,
    elapsed: state.elapsed + dt,
    stats,
    reticle,
    rngState: rng.save(),
  };
}


