import { AMMO_MAX, RELOAD_FILL } from '../game/rules.js';
import { weaponAt } from '../game/weapons.js';
import { levelCount } from '../game/levels.js';

// 表现层只读状态，把数字和状态翻成 HUD 上的文案。
// 结算标题已经说了成败，所以这里的两句要给出别的信息，而不是把标题重复一遍。
const STATUS_TEXT = {
  ready: '拖左侧走位，右侧点跳',
  playing: '推进',
  paused: '已暂停',
  dying: '再上一次',
  clear: '据点清除',
  over: '弹尽人亡，从头再来',
  won: '八个据点全部清除',
};


const PICKUP_TEXT = { spread: '散弹枪', machine: '机枪', laser: '穿甲激光', ammo: '弹药箱' };

export const formatScore = (score) => String(Math.max(0, Math.floor(score))).padStart(6, '0');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const statusLabel = (status) => STATUS_TEXT[status] ?? '';

export const levelLabel = (state) => `${state.levelKey} ${state.levelName}`;

export const progressLabel = (state) => `第 ${state.levelIndex + 1} / ${levelCount} 关`;

export const starLabel = (stars) => '★★★'.slice(0, stars).padEnd(3, '☆');

export const weaponLabel = (player) => weaponAt(player.weapon).name;

export const pickupLabel = (kind) => PICKUP_TEXT[kind] ?? '补给';

export const ammoLabel = (player) => `${player.mag} / ${AMMO_MAX}`;

// 弹匣状态分三档说话，因为玩家要做的决策也只有三种：接着压、找机会趴下、现在必须停火。
export const ammoMood = (player) => {
  if (player.reloading) return 'reloading';
  if (player.mag <= RELOAD_FILL) return 'low';
  return 'ready';
};

export const ammoHint = (player) => {
  if (player.reloading) return '装填中';
  if (player.mag <= RELOAD_FILL) return '弹匣见底：蹲下换弹或贴上去打';
  return '';
};

// 装填进度条：蹲着装比站着装快得多，所以这条进度必须画出来，否则玩家不知道蹲着划算。
export const reloadRatio = (player) => (player.reloading ? Math.min(1, Math.max(0, player.reloadAt)) : 0);

export const ammoRatio = (player) => Math.min(1, Math.max(0, player.mag / AMMO_MAX));

// 连击只在真连着的时候报，断了就不显示——不然这个数字就只是装饰。
export const chainLabel = (player) => (player.hitChain >= 2 ? `连击 ${player.hitChain}` : '');

export const bossRatio = (boss) => (boss ? Math.max(0, boss.hp) / Math.max(1, boss.maxHp) : 0);

export const bossLabel = (boss) => {
  if (!boss || !boss.active) return '';
  if (boss.hp <= 0) return '核心已毁';
  return boss.open ? '核心舱开启' : '装甲闭合';
};

// 进度条按玩家走到的横向位置算，那台机器就是 100%。
export const progressRatio = (state) =>
  Math.min(1, Math.max(0, (state.player.x + state.player.w / 2) / Math.max(1, state.width - 8)));

export const resultTitle = (status) => (status === 'won' ? '全线突破' : '任务失败');

export const recordLabel = (isRecord) => (isRecord ? '新纪录' : null);

export const muteLabel = (muted) => (muted ? '音效已关' : '音效已开');

export const rewardLabel = (stars) => {
  if (stars >= 3) return '满星突破';
  if (stars === 2) return '再多贴身打几发就是满星';
  if (stars === 1) return '走到底了，下次少打空弹';
  return '这一趟没走完，再来一次';
};
