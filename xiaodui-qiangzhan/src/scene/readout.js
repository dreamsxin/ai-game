import { MAG_SIZE, MAX_HEALTH, RELOAD_TIME, SCORE_LIMIT, TEAM_ALLY, accuracy, clamp } from '../game/rules.js';

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const formatScore = (score) => Math.max(0, Math.floor(score)).toLocaleString('zh-CN');

export const teamLabel = (team) => (team === TEAM_ALLY ? '我方' : '敌方');

export const scoreLabel = (score) => `${score[TEAM_ALLY]} : ${score.enemy}`;

export const goalLabel = () => `先到 ${SCORE_LIMIT} 分`;

export const healthRatio = (unit) => (unit ? clamp(unit.health / MAX_HEALTH, 0, 1) : 0);

export const ammoLabel = (unit) => (unit ? `${unit.ammo} / ${MAG_SIZE}` : '- / -');

export const reloadRatio = (unit) =>
  unit && unit.reloading > 0 ? clamp(1 - unit.reloading / RELOAD_TIME, 0, 1) : 0;

export const respawnLabel = (unit) =>
  unit && !unit.alive ? `${Math.ceil(unit.respawnIn)} 秒后重生` : '';

export const accuracyPercent = (stats) => `${Math.round(accuracy(stats.hits, stats.shots) * 100)}%`;

export const kdLabel = (stats) => `${stats.kills} / ${stats.deaths}`;

export const streakLabel = (streak) => (streak > 1 ? `${streak} 连杀` : '');

// 软锁状态直接写在 HUD 上：玩家得看得见辅助什么时候咬住了目标。
export const lockLabel = (reticle) => {
  if (!reticle.targetId) return '自由瞄准';
  return reticle.locked ? '已锁定' : '辅助跟枪';
};

export const focusLabel = (reticle) => (reticle.focus > 0.99 ? '端稳' : reticle.focus > 0 ? '收枪中' : '');

export const killfeedText = (entry) => `${entry.killer} 淘汰了 ${entry.victim}`;

export const statusLabel = (state) => {
  if (state.status === 'ready') return '3v3 团队死斗 · 准备开打';
  if (state.status === 'paused') return '暂停';
  if (state.status === 'won') return `我方拿下 ${scoreLabel(state.score)}`;
  if (state.status === 'over') {
    return state.score[TEAM_ALLY] === state.score.enemy
      ? `打平 ${scoreLabel(state.score)}`
      : `敌方拿下 ${scoreLabel(state.score)}`;
  }
  return '交火中';
};

export const rosterLine = (unit) =>
  unit.alive ? `${unit.name} ${Math.ceil(unit.health)}` : `${unit.name} ${Math.ceil(unit.respawnIn)}s`;
