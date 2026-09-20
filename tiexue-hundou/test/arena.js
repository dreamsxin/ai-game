// 一个只会「往右压、遇坑跳、见弹跳、弹匣空了趴下换弹」的机器人。
// 它是关卡难度的守门人：同一个大脑跑完八关，说明每关都过得去。
//
// allow 可以掐掉它的某一路操作，用来跑对照组——
// 掐掉瞄准（aim）或掐掉压上去（advance），通关就该明显变难，
// 否则「八向射击」和「往前压」这两条设计就只存在于说明文字里。
import { centerOf, weakBox } from '../src/game/entities.js';
import { isPlatform, isSolid, tileAt } from '../src/game/tiles.js';
import { LEVEL_ROWS } from '../src/game/levels.js';
import { STEP, startGame, step } from '../src/game/simulation.js';

const solid = (grid, col, row) => isSolid(tileAt(grid, col, row));
const stand = (grid, col, row) => solid(grid, col, row) || isPlatform(tileAt(grid, col, row));
// 这一列脚下第一个能站的面在哪：找不到说明下面是水或者虚空，那才是真的坑。
const surfaceBelow = (grid, col, from) => {
  for (let row = from; row < LEVEL_ROWS; row += 1) if (stand(grid, col, row)) return row;
  return null;
};


export function createBot({ allow = {} } = {}) {
  const canAdvance = allow.advance !== false;
  const canAim = allow.aim !== false;
  const canProne = allow.prone !== false;
  // 在 Boss 面前来回挪半格：直瞄弹打的是「你刚才站的地方」，所以别站死。
  let sway = 0;

  return (state) => {
    const p = state.player;
    const pc = centerOf(p);
    const grid = state.grid;
    const foot = Math.floor(p.y + p.h + 0.1);
    const ahead = Math.floor(p.x + p.w + 0.55);

    let target = null;
    let near = Infinity;
    for (const enemy of state.enemies) {
      if (!enemy.awake) continue;
      const c = centerOf(enemy);
      const d = Math.hypot(c.x - pc.x, c.y - pc.y);
      if (d < near && d < 17) {
        near = d;
        target = c;
      }
    }

    const boss = state.boss && state.boss.hp > 0 ? state.boss : null;
    const bossGap = boss ? boss.x - (p.x + p.w) : Infinity;

    let right = canAdvance;
    let left = false;
    let up = false;
    let down = false;
    let jump = false;

    // 打 Boss 的站位：离前装甲两格多，平射正好切进核心舱那条线。
    if (boss && bossGap < 3.4) {
      sway += 1;
      right = bossGap > 2.6 && sway % 90 < 45;
      left = bossGap < 1.6 || sway % 90 >= 45;
      if (left && bossGap > 3) left = false;
    }

    // 前面那个缺口是不是真的坑：底下还有能站的面就只是台阶，走下去就行，不用跳。
    const gap = !stand(grid, ahead, foot) && !stand(grid, ahead + 1, foot);
    const landing = surfaceBelow(grid, ahead, foot);
    if (gap && landing === null) jump = true;
    if (solid(grid, ahead, foot - 1)) jump = true;

    // 站在钢架上就漏下去回到地面这一层：在空中被弹幕推到高处，是掉进坑里的头号原因。
    const under = tileAt(grid, Math.floor(pc.x), foot);
    if (p.grounded && isPlatform(under) && surfaceBelow(grid, Math.floor(pc.x), foot + 1) !== null) {
      down = true;
      jump = true;
      right = false;
    }

    // 空中刹车：落点那一列没有能站的面，就往回拉一把，宁可原地落下也不掉水里。
    if (!p.grounded && p.vy > 0 && surfaceBelow(grid, Math.floor(pc.x + p.vx * 0.35), foot) === null) {
      right = false;
      left = p.vx > 0;
    }


    // 躲弹：迎面飞来、高度差在一个身位以内、还有三格多就到，就跳起来让开。
    for (const bullet of state.bullets) {
      if (bullet.owner !== 'enemy') continue;
      const dx = bullet.x - pc.x;
      const dy = bullet.y - pc.y;
      if (Math.abs(dy) > 1.4 || Math.abs(dx) > 3.4) continue;
      if (dx * bullet.vx > 0) continue;
      jump = true;
    }


    if (canAim && target) {
      if (target.y < pc.y - 1.2) up = true;
      else if (!p.grounded && target.y > pc.y + 1) down = true;
    }
    // Boss 的核心舱压在站姿枪口那条线上，所以打它的时候手要放平。
    if (boss && bossGap < 8) {
      const weak = weakBox(boss);
      if (weak.y > pc.y + 1.2) down = !p.grounded;
      up = false;
    }

    // 弹匣见底就趴下快速装填——但得先没人往你这边开枪。
    // 这是这游戏唯一的喘气动作，也是「不能一路按住射击」的那条规则的具体形态。
    const underFire = state.bullets.some(
      (bullet) => bullet.owner === 'enemy' && Math.hypot(bullet.x - pc.x, bullet.y - pc.y) < 4.6,
    );
    if (canProne && p.grounded && p.mag <= 2 && !underFire && near > 5.5) {
      down = true;
      right = false;
      left = false;
      jump = false;
    }


    return { jump: jump && (p.grounded || p.coyote > 0), held: { left, right, up, down, jump } };
  };
}

/**
 * 只打 Boss 的对照台：把机器人直接放到那台机器面前，场上不留别的兵，
 * 并且让它打不死——这样测出来的就是纯粹的持续输出，不掺死亡与重生的噪声。
 * 弹药经济的差别在这里最干净：跑关卡时装填可以边走边装，站定打 Boss 时装填就是停火。
 */
export function runBossDuel(index, { refund = true, frames = 60 * 400 } = {}) {
  const bot = createBot({});
  const base = startGame(index, { refund });
  const boss = base.boss;
  const y = boss.y + boss.h - base.player.h;
  let state = {
    ...base,
    enemies: [],
    pods: [],
    // 站到前装甲左边四格：这是平射能打进核心舱的位置。
    player: { ...base.player, x: boss.x - 4, y, safeX: boss.x - 4, safeY: y },
  };
  let count = 0;
  let reloads = 0;
  let shots = 0;
  while (count < frames) {
    state = { ...state, player: { ...state.player, invuln: 9 } };
    state = step(state, bot(state), STEP);
    for (const effect of state.effects) {
      if (effect.type === 'reload') reloads += 1;
      if (effect.type === 'fire') shots += 1;
    }
    count += 1;
    if (state.status === 'clear' || state.status === 'over') break;
  }
  return {
    status: state.status,
    seconds: count * STEP,
    reloads,
    shots,
    bossHp: state.boss ? state.boss.hp : 0,
  };
}

/** 让机器人打完一关，返回结果。frames 封顶避免测试卡死。 */
export function runLevel(index, { allow, lives = 30, refund = true, frames = 60 * 320 } = {}) {

  const bot = createBot({ allow });
  let state = { ...startGame(index, { refund }), lives };
  let count = 0;
  let shots = 0;
  let hits = 0;
  let dry = 0;
  while (count < frames) {
    state = step(state, bot(state), STEP);
    for (const effect of state.effects) {
      if (effect.type === 'fire') shots += 1;
      if (effect.type === 'hit' || effect.type === 'weak') hits += 1;
      if (effect.type === 'dry') dry += 1;
    }
    count += 1;
    // 打倒 Boss 就算这一关结束，不用等结算演出放完。
    if (state.status === 'clear' || state.status === 'over') break;
  }
  return {
    status: state.status,
    cleared: state.status === 'clear',
    frames: count,
    seconds: count * STEP,
    state,
    shots,
    hits,
    dry,
    livesLeft: state.lives,
    bossHp: state.boss ? state.boss.hp : 0,
  };
}

