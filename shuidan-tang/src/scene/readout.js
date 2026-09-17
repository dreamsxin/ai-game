// 面板文案。全是纯函数，所以能单测——UI 上写错一个字和逻辑写错一个数一样值得被守住。
//
// 这一层要回答的问题只有一个：**现在这一秒，玩家最需要知道什么**。
// 被困住时需要知道「猛点按钮」，剩十几秒时需要知道「时间到算输」，
// 手上没装备时需要知道「先去拆箱」。所以提示是跟着处境走的，不是一句固定的教程。

import { BUBBLE_LIFE, MAX_BOMBS, MAX_POWER, MAX_SPEED_LV } from '../game/rules.js';
import { ITEMS } from '../game/maps.js';
import { HUMAN } from '../game/simulation.js';

export const formatScore = (score) => String(Math.max(0, Math.round(score))).padStart(5, '0');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const levelLabel = (view) => `第 ${view.levelIndex + 1} 关 · ${view.levelName}`;

export const statusLabel = (status) => {
  if (status === 'ready') return '格子对战 · 困住再补掉';
  if (status === 'paused') return '暂停';
  if (status === 'clear') return '清场';
  if (status === 'down') return '这一局没撑住';
  if (status === 'over') return '命用完了';
  if (status === 'won') return '八关全清';
  return '';
};

export const resultTitle = (status) => {
  if (status === 'won') return '通关';
  if (status === 'over') return '结束';
  if (status === 'down') return '再来一次';
  return '水弹堂';
};

export const starLabel = (stars) => '★'.repeat(Math.max(0, stars)) + '☆'.repeat(Math.max(0, 3 - stars));

export const muteLabel = (muted) => (muted ? '开声音' : '静音');

/** 动作键的字面：活着是放弹，被困住是挣脱。同一颗按钮换一个名字。 */
export const actionLabel = (player) => (player.state === 'bubble' ? '猛点挣脱' : '放水弹');

/** 剩下几个对手。清场是唯一的过关条件，所以这个数字比分数重要。 */
export const rivalLabel = (view) => {
  const alive = view.players.filter((player) => player.id !== HUMAN && player.state !== 'out');
  const bubbled = alive.filter((player) => player.state === 'bubble').length;
  if (!alive.length) return '清场';
  return bubbled ? `对手 ${alive.length}（${bubbled} 个是水泡）` : `对手 ${alive.length}`;
};

/** 装备条：三个数字就是这一关的全部战斗力。 */
export const gearLabel = (player) =>
  `弹 ${player.bombs}/${MAX_BOMBS} · 压 ${player.power}/${MAX_POWER} · 速 ${player.speedLv}/${MAX_SPEED_LV}${player.kick ? ' · 踢' : ''}`;

export const itemName = (code) => ITEMS[code]?.name ?? code;

/** 水泡的剩余比例。UI 用它画那圈越来越短的环——挣脱是有倒计时的。 */
export const bubbleRatio = (player) =>
  player.state === 'bubble' ? Math.max(0, Math.min(1, player.bubble / BUBBLE_LIFE)) : null;

/**
 * 这一秒该说的一句话。顺序就是紧急程度：
 * 被困住 > 有水泡可以补 > 时间快到 > 装备太薄 > 什么都不说（不说话也是一种回答）。
 */
export function hintLine(view) {
  const me = view.players[HUMAN];
  if (me.state === 'bubble') return '猛点按钮挣脱——被补一发就出局';
  if (me.state === 'out') return '';
  const bubbled = view.players.filter((player) => player.id !== HUMAN && player.state === 'bubble');
  if (bubbled.length) return `${bubbled[0].name}还是水泡，补一发就清掉它`;
  if (view.time <= 20) return '时间到算输，别耗着';
  if (me.power <= 1 && me.bombs <= 1) return '先拆箱：道具都藏在箱子里';
  return '';
}

export const progressRatio = (view) => {
  const level = view.players.length - 1;
  const out = view.players.filter((player) => player.id !== HUMAN && player.state === 'out').length;
  return level > 0 ? out / level : 0;
};

/** 开局提示。写的是规则里最反直觉的那几条，不是操作说明。 */
export const TIPS = [
  '摇杆或方向键走位，动作键放水弹；水弹 2.4 秒后炸出十字爆流',
  '炸中不等于打死：对手先变成水泡，还得再补一发才算清掉',
  '自己被裹成水泡时猛点按钮能提前挣脱，挣脱后有一小段无敌',
  '水泡是实体，堵在巷口就是一面临时的墙——也可能堵住你自己的退路',
  '箱子既是掩体也是装备来源：加弹、加压、加速、踢弹全藏在箱子里',
  '爆流会连锁引爆，多放几发不是叠伤害，是叠不可控',
  '捡到踢弹后撞向水弹能把它踢出去，射程外的对手也能被赶进爆流',
  '限时内清掉所有对手才算过关；时间到算输，蹲角落不是策略',
];
