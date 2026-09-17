// 机器人对局的公共跑法。bots 和 playthrough 两组测试都用它，
// 好处是「让同一个大脑接管玩家」这件事只写一遍——
// 而且因为玩家的输入是我们自己喂的，可以**掐掉其中一路操作**（比如不许漂移），
// 用来验证「漂移不是可选项」这类设计主张。

import { STEP } from '../src/game/rules.js';
import { botInput } from '../src/game/bots.js';
import { HUMAN, startGame, step } from '../src/game/simulation.js';

export const MAX_SECONDS = 240;

export function play({ levelIndex = 0, attempt = 0, skill = 1, rivalSkill = null, allow = {} } = {}) {
  const state = startGame(levelIndex, attempt);
  const me = state.karts[HUMAN];
  me.skill = skill;
  if (rivalSkill !== null) {
    for (const kart of state.karts) if (kart.id !== HUMAN) kart.skill = rivalSkill;
  }

  const tally = { walls: 0, grass: 0, boosts: 0, ready: 0, fizzle: 0, chain: 0, overtake: 0, passed: 0 };
  let frames = 0;
  const limit = Math.round(MAX_SECONDS / STEP);
  while (state.status === 'playing' && frames < limit) {
    const cmd = botInput(me, state.level.course, {
      skill,
      countdown: state.countdown,
      tick: state.tick,
      seed: attempt,
    });
    step(
      state,
      {
        steer: cmd.steer,
        drift: allow.drift === false ? false : cmd.drift,
        boost: allow.boost === false ? false : cmd.boost,
      },
      STEP,
    );
    frames += 1;
    for (const effect of state.effects) {
      if (!effect.self) continue;
      if (effect.type === 'wall') tally.walls += 1;
      if (effect.type === 'grass') tally.grass += 1;
      if (effect.type === 'boost') tally.boosts += 1;
      if (effect.type === 'ready') tally.ready += 1;
      if (effect.type === 'fizzle') tally.fizzle += 1;
      if (effect.type === 'chain') tally.chain += 1;
      if (effect.type === 'overtake') tally.overtake += 1;
      if (effect.type === 'passed') tally.passed += 1;
    }
  }

  return {
    status: state.status,
    seconds: frames * STEP,
    rank: me.rank,
    stars: state.stars,
    best: me.best,
    laps: me.lap,
    tally,
    me,
    state,
  };
}

/** 同一关跑若干个 seed，返回过关次数。 */
export function sample(levelIndex, attempts, options = {}) {
  const runs = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    runs.push(play({ levelIndex, attempt, ...options }));
  }
  return {
    runs,
    cleared: runs.filter((run) => run.status === 'clear' || run.status === 'won').length,
  };
}
