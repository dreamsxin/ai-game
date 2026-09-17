// 界面上的所有文字。纯函数，不碰 DOM，所以「相反的处境不会显示同一句话」能单测。
//
// 提示行只说**下一步该干什么**，而且一次只说一句。赛车游戏里玩家的眼睛全在弯心上，
// 任何需要读两行才明白的提示等于没有提示。

import { LAUNCH_WINDOW, MAX_SPEED, tierOf } from '../game/rules.js';
import { HUMAN } from '../game/simulation.js';
import { LEVEL_COUNT } from '../game/tracks.js';

export const TIPS = [
  '按住手刹过弯，横着走才攒气',
  '气攒够一档就能喷，出弯的直道上最划算',
  '松手后半秒内再入漂＝连喷，一串接下来越喷越猛',
  '读秒最后一下按氮气是弹射起步，早按会罚站',
];

export const TIER_NAMES = ['', '小喷', '中喷', '大喷'];

export const tierName = (tier) => TIER_NAMES[tier] ?? '';

export const formatScore = (score) => String(Math.max(0, Math.round(score))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 比赛用时：分'秒.十分位。名次差常常只有零点几秒，所以小数位必须留一位。 */
export function formatTime(seconds = 0) {
  const value = Math.max(0, seconds);
  const min = Math.floor(value / 60);
  const rest = value - min * 60;
  const text = rest < 10 ? `0${rest.toFixed(1)}` : rest.toFixed(1);
  return `${min}:${text}`;
}

export const formatLap = (seconds) => (seconds > 0 ? `${seconds.toFixed(2)}s` : '--');

/** 逻辑层用 m/s，仪表盘按习惯显示 km/h。 */
export const speedLabel = (speed = 0) => Math.round(Math.max(0, speed) * 3.6);

export const ordinal = (rank) => `第${rank}名`;

export const levelLabel = (view) => `第${view.levelIndex + 1}关 ${view.level.name}`;

export const lapLabel = (view) => {
  const me = view.karts[HUMAN];
  const lap = Math.min(view.level.laps, Math.max(1, me.lap + 1));
  return `${lap}/${view.level.laps}圈`;
};

export const qualifyLabel = (view) =>
  view.level.qualify === 1 ? '冠军才算过关' : `前${view.level.qualify}名过关`;

export const rivalLabel = (view) => `${view.total} 车同场`;

export const starLabel = (stars) => '★★★'.slice(0, stars).padEnd(3, '☆');

export const muteLabel = (muted) => (muted ? '开启音效' : '静音');

export const STATUS = {
  ready: '按下开始，读秒最后一下按氮气弹射起步',
  playing: '',
  paused: '暂停中',
  clear: '过关',
  down: '名次不够',
  over: '车队解散了',
  won: '八条赛道全通',
};

export const statusLabel = (status) => STATUS[status] ?? '';

export const resultTitle = (status) =>
  status === 'won' ? '全线通关' : status === 'over' ? '比赛结束' : status === 'clear' ? '过关' : '没进名次';

/** 喷射档位的三格指示。渲染层和面板共用，省得两处各写一套。 */
export const tokenPips = (tokens = [], max = 3) =>
  Array.from({ length: max }, (unused, index) => tokens[index] ?? 0);

/**
 * 提示行。顺序就是优先级：**先说正在亏的事，再说马上能赚的事**。
 * 「草地上攒不到气」和「气攒好了出弯就喷」是两个相反的处境，
 * 它们必须给出两句不同的话——这条是这个文件唯一值得测的东西。
 */
export function hintLine(view) {
  const me = view.karts[HUMAN];
  if (view.countdown > 0) {
    if (me.launch === 'early') return '抢跑了，灯灭后要罚站';
    if (me.launch === 'perfect') return '弹射就绪，灯灭冲出去';
    return view.countdown <= LAUNCH_WINDOW ? '就是现在，按氮气！' : '等读秒到最后一下再按氮气';
  }
  if (me.stall > 0) return '抢跑罚站中，等它过去';
  if (me.offTrack) return '草地上攒不到气，先回赛道';
  if (me.drifting && tierOf(me.charge) === 0) return '再多打一点方向，气还不够一档';
  if (!me.drifting && me.comboTimer > 0) return '趁窗口没关，立刻再入漂接连喷';
  if (!me.drifting && me.tokens.length > 0) {
    return `${tierName(Math.max(...me.tokens))}攒好了，出弯的直道上喷`;
  }
  if (me.draft) return '吃着尾流，出弯就能超掉他';
  if (me.rank > view.level.qualify) return `名次差 ${me.rank - view.level.qualify} 位，跟住前车`;
  if (me.speed > MAX_SPEED * 0.95 && !me.drifting) return '这段是直道，气留着别浪费';
  return '';
}

/** 过关面板上那一行「下一关是什么」。最后一关不说下一关。 */
export const nextLabel = (view) =>
  view.levelIndex + 1 >= LEVEL_COUNT ? '收官' : '下一关';
