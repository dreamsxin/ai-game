import { levelCount } from '../game/levels.js';
import { LAB_CHAPTER, MAX_TIER, WEAKNESS, WINGS, clampTier, tierOf } from '../game/wings.js';
import { FIELD_H } from '../game/rules.js';

// 表现层只读状态，把数字和状态翻成 HUD 上的文案。中文全部集中在这里，App.jsx 里不硬编码字符串。
const STATUS_TEXT = {
  ready: '拖动走位，轻点弃翼',
  select: '这一关带哪只翅膀',
  playing: '推进',
  paused: '已暂停',
  dying: '再来一次',
  clear: '关卡完成',
  over: '任务失败',
  won: '夺回全部机翼',
};

export const formatScore = (score) => String(Math.max(0, Math.floor(score))).padStart(7, '0');

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const statusLabel = (status) => STATUS_TEXT[status] ?? '';

export const levelLabel = (state) => `${state.levelKey} ${state.levelName}`;

export const progressLabel = (state) => `第 ${state.levelIndex + 1} / ${levelCount} 关`;

export const starLabel = (stars) => '★★★'.slice(0, stars).padEnd(3, '☆');

export const muteLabel = (muted) => (muted ? '音效已关' : '音效已开');

export const wingName = (code) => (code ? WINGS[code]?.name ?? code : '无机翼');

/** 机翼的出身：常规十种、后期解锁的实验机翼，还是只能捡到的秘密机翼。 */
export const wingClass = (code) => {
  const wing = WINGS[code];
  if (!wing) return '';
  if (wing.secret) return '秘密';
  return wing.lab ? '实验' : '常规';
};

/** 阶级标签。Mk.I 不显示——没升过阶就不该占屏幕。 */
export const tierLabel = (tier = 1) => (clampTier(tier) > 1 ? tierOf(tier).name : '');

/** HUD 上那一格火力状态。裸机是一句警告，不是一个名词。 */
export const wingLabel = (ship) => {
  if (!ship.wing) return ship.dive > 0 ? `下潜 ${ship.dive.toFixed(1)}s` : '裸机 · 只剩小炮';
  const wing = WINGS[ship.wing];
  const mark = tierLabel(ship.tier);
  return mark ? `${wing.code} ${wing.name} ${mark}` : `${wing.code} ${wing.name}`;
};

/** 进化提示：还能不能再叠，叠满了就直说。 */
export const evolveLabel = (ship) => {
  if (!ship.wing) return '';
  if (clampTier(ship.tier) >= MAX_TIER) return '已满阶';
  return `再捡一个 ${ship.wing} 可升 ${tierOf(ship.tier + 1).name}`;
};

/** 弃翼键该显示什么。翅膀刚接上有一小段锁定，这时候按了不算。 */
export const jettisonLabel = (ship) => {
  if (!ship.wing) return '无翼可弃';
  return ship.lock > 0 ? '锁定中' : '弃翼下潜';
};

export const weakLabel = (weak) => WEAKNESS[weak]?.label ?? '';
export const weakHint = (weak) => WEAKNESS[weak]?.hint ?? '';

/** 关卡简报里那一行：Boss 是谁、弱点在哪、推荐带什么。 */
export const briefLine = (brief) =>
  `${brief.boss} · ${brief.label} · 推荐 ${brief.pick} ${wingName(brief.pick)}`;

/** 机翼选择卡片上的一行说明。 */
export const wingLine = (code) => {
  const wing = WINGS[code];
  return wing ? `${wing.desc}｜${wing.use}` : '';
};

/** Boss 血条。没有 Boss 时返回 null，让 App 决定要不要画。 */
export const bossRatio = (state) =>
  state.boss ? Math.max(0, Math.min(1, state.boss.hp / state.boss.maxHp)) : null;

/** 关卡进度按「Boss 还有多久出场」算；Boss 已经出来了就是满格。 */
export const progressRatio = (state, bossTime) => {
  if (state.boss) return 1;
  return Math.max(0, Math.min(1, state.time / Math.max(1, bossTime)));
};

/** 连消敌弹的提示。只在真连上了才报，连 1 发不值得占屏幕。 */
export const chainLabel = (chain) => (chain >= 3 ? `连消 ${chain}` : '');

export const resultTitle = (status) => (status === 'won' ? '全线夺回' : '任务失败');

// 只有真刷掉旧的最高分才报新纪录，否则每局都报喜就不值钱了。
export const recordLabel = (isRecord) => (isRecord ? '新纪录' : null);

/** 星级点评按拿到几颗给，通关本身不该被挑刺。 */
export const rewardLabel = (stars) => {
  if (stars >= 3) return '一条命都没掉';
  if (stars === 2) return '掉了命，但翅膀守住了';
  if (stars === 1) return '打完了，就是有点狼狈';
  return '这一趟没走完，再来一次';
};

/** 跳关提示：跳过去的 Boss 不会因为你跳了就变弱。 */
export const gateLabel = (gate) =>
  gate ? `跳关门 · 撞进去省 4 关（Boss 不会削弱）` : '';

/** 选翼界面顶上那句：这一章有没有实验机翼可选。 */
export const labLabel = (unlocked) =>
  unlocked ? '实验机翼已解锁：它们不啃装甲，强在吃弹幕和铺覆盖' : `第 ${LAB_CHAPTER * 4 + 1} 关起解锁实验机翼`;

/** 让渲染层和 HUD 共用同一套坐标换算：场地格 → 画布像素。 */
export const scaleFor = (width, height) => {
  const scale = Math.min(width / 100, height / FIELD_H);
  return { scale, offsetX: (width - 100 * scale) / 2, offsetY: (height - FIELD_H * scale) / 2 };
};
