// 赏金编队：把「这一波打干净」变成一件有回报的事。
//
// 雷电那一套是关内捡勋章、关末按 1000 × 保险存量 × 勋章数结算，中途死一次勋章清零；
// 本作没有保险存量，换成挂在机上的阶级——保住 Mk.III 打完一关，勋章最值钱。
// 另外接了雷电 3 的 Flash Shot：一波从生成到全歼用时够短，额外给一笔速歼分。
//
// 这一层只回答「算不算全歼、给了几枚、结算多少分」，不认识状态机、不认识 three。
// 波次的出场图案在 enemies.js，点名哪些波是赏金波在 levels.js，接线在 simulation.js。

import { FLASH_SCORE, FLASH_WINDOW, MEDAL_UNIT } from './rules.js';

/** 本关被点名的波次（带波次下标）。选翼面板与 HUD 都读它，别在两处各写一份规则。 */
export const bountyWaves = (level) => (level?.waves ?? [])
  .map((wave, index) => ({ ...wave, index }))
  .filter((wave) => wave.bounty);

/** 新一关的进度表。total 由实际生成数覆盖——障碍墙会留一个缺口，少生成一架。 */
export const bountyTracker = (level) => {
  const waves = {};
  for (const wave of bountyWaves(level)) {
    waves[wave.index] = { total: wave.count, done: 0, kills: 0, escaped: 0, at: wave.at, settled: false };
  }
  return { waves, medals: 0, flashes: 0 };
};

/** 波次真正生成的那一帧登记：时间取实际帧，敌数取实际生成数。 */
export const registerBounty = (tracker, waveId, total, at) => {
  const cur = tracker.waves[waveId];
  if (!cur) return tracker;
  return {
    ...tracker,
    waves: {
      ...tracker.waves,
      [waveId]: { ...cur, total, at, settled: false, done: 0, kills: 0, escaped: 0 },
    },
  };
};

/**
 * 结算本帧的击破／脱逃。返回新的 tracker 和一串「刚刚发生」的事件，
 * 事件再交给表现层出声出光。全歼 = 一架都没飞出去，且总处理数等于生成数。
 */
export function settleBounty(tracker, events = [], now = 0) {
  if (!events.length) return { tracker, events: [] };
  const waves = { ...tracker.waves };
  let medals = tracker.medals;
  let flashes = tracker.flashes;
  const out = [];
  for (const event of events) {
    const cur = waves[event.waveId];
    if (!cur || cur.settled) continue;
    const count = Math.max(0, event.count ?? 0);
    const next = {
      ...cur,
      done: cur.done + count,
      kills: cur.kills + (event.kind === 'kill' ? count : 0),
      escaped: cur.escaped + (event.kind === 'escape' ? count : 0),
    };
    if (next.done >= cur.total) {
      next.settled = true;
      if (next.escaped === 0 && next.kills >= cur.total) {
        // 从生成到全歼的时间够短 → Flash Shot。奖励的是集中火力，不是躲得远。
        const flash = now - cur.at <= FLASH_WINDOW;
        medals += 1;
        if (flash) flashes += 1;
        out.push({
          type: 'medal',
          waveId: event.waveId,
          medals,
          flash,
          points: flash ? FLASH_SCORE : 0,
        });
      } else {
        out.push({ type: 'bountyLost', waveId: event.waveId });
      }
    }
    waves[event.waveId] = next;
  }
  return { tracker: { waves, medals, flashes }, events: out };
}

/** 掉命：本关勋章清零（雷电规则）。闪电战绩只记在 tracker 里，不因此回滚。 */
export const loseMedals = (tracker) => ({ ...tracker, medals: 0 });

/**
 * Boss 出场时的收口：还没打完的赏金编队一律按撤离结算。
 * 没有这一步，尾波会静静悬到关末——HUD 上一枚勋章没有，也没有任何一句解释。
 */
export const forceSettleBounty = (tracker) => {
  const waves = { ...tracker.waves };
  const events = [];
  for (const [id, cur] of Object.entries(waves)) {
    if (cur.settled) continue;
    waves[id] = { ...cur, settled: true, escaped: cur.escaped + Math.max(0, cur.total - cur.done) };
    events.push({ type: 'bountyLost', waveId: Number(id), reason: 'boss' });
  }
  return { tracker: { ...tracker, waves }, events };
};

/** 关末结算：勋章 × 保住的阶级 × 单价。裸机也算一阶，别让结算变成 0 的尴尬。 */
export const medalBonus = (medals, tier) =>
  MEDAL_UNIT * Math.max(0, medals) * Math.min(3, Math.max(1, Math.floor(tier)));
