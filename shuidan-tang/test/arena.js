// 机器人对局的公共跑法。playthrough 和 bots 两组测试都用它，
// 好处是「让同一个大脑接管玩家」这件事只写一遍：判定层分不出人和机器人，测试也就不用分。

import { STEP } from '../src/game/rules.js';
import { LEVELS } from '../src/game/maps.js';
import { startGame, step } from '../src/game/simulation.js';

export const MAX_SECONDS = 200;

/**
 * 跑完一局。skill 是接管玩家的那个大脑的档位，foeSkill 给定时覆盖对手档位
 * （用来单独验证「档位真的是难度」，而不是靠改地图）。
 */
export function play({ levelIndex = 0, attempt = 0, skill = 1, foeSkill = null } = {}) {
  const state = startGame(levelIndex, attempt);
  const me = state.players[0];
  me.bot = true;
  me.skill = skill;
  if (foeSkill !== null) {
    for (const player of state.players) if (player.id !== 0) player.skill = foeSkill;
  }

  const tally = { selfBubble: 0, foeBubble: 0, kicks: 0, crates: 0 };
  let frames = 0;
  const limit = Math.round(MAX_SECONDS / STEP);
  while (state.status === 'playing' && frames < limit) {
    step(state, undefined, STEP);
    frames += 1;
    for (const effect of state.effects) {
      if (effect.type === 'bubble' && effect.victim === 0) {
        if (effect.owner === 0) tally.selfBubble += 1;
        else tally.foeBubble += 1;
      }
      if (effect.type === 'kick') tally.kicks += 1;
    }
  }
  return {
    status: state.status,
    seconds: frames * STEP,
    kills: state.kills,
    bubbles: state.bubbles,
    crates: state.crates,
    stars: state.stars,
    level: LEVELS[levelIndex],
    tally,
    state,
  };
}

/** 同一关跑若干个 seed，返回清场次数。 */
export function sample(levelIndex, attempts, options = {}) {
  const runs = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    runs.push(play({ levelIndex, attempt, ...options }));
  }
  return { runs, cleared: runs.filter((run) => run.status === 'clear').length };
}
