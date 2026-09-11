import { levelCount } from '../game/levels.js';

// 表现层只读状态，把数字和状态翻成 HUD 上的文案。
const STATUS_TEXT = {
  ready: '点右侧起跳，拖左侧跑动',
  playing: '前进',
  paused: '已暂停',
  dying: '再来一次',
  clear: '过关',
  over: '游戏结束',
  won: '全线通关',
};

const CLEAR_TEXT = {
  stomp: '踩中',
  kick: '撞飞',
  coin: '金币',
  grow: '变大',
  star: '无敌',
  brick: '砖块',
  clear: '过关',
};

export const formatScore = (score) => String(Math.max(0, Math.floor(score))).padStart(6, '0');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const statusLabel = (status) => STATUS_TEXT[status] ?? '';

export const effectLabel = (type) => CLEAR_TEXT[type] ?? '';

export const levelLabel = (state) => `${state.levelKey} ${state.levelName}`;

export const progressLabel = (state) => `第 ${state.levelIndex + 1} / ${levelCount} 关`;

export const starLabel = (stars) => '★★★'.slice(0, stars).padEnd(3, '☆');

export const powerLabel = (player) => {
  if (player.star > 0) return `无敌 ${Math.ceil(player.star)}s`;
  return player.power === 'small' ? '普通' : '强化';
};

// 进度条按玩家走到的横向位置算，终点旗杆就是 100%。
export const progressRatio = (state) =>
  Math.min(1, Math.max(0, (state.player.x + state.player.w / 2) / Math.max(1, state.width - 6)));

export const resultTitle = (status) => (status === 'won' ? '全线通关' : '游戏结束');
