import { chapterNumber, isChapterEnd, levelCount } from '../game/levels.js';
import { LAB_CHAPTER, MAX_TIER, SURGE, WEAKNESS, WINGS, clampTier, tierOf } from '../game/wings.js';
import { GEAR, MAX_FORMATION, gearLine } from '../game/gear.js';
import { CHAPTER_LIFE_BONUS, FIELD_H } from '../game/rules.js';
import { maxStars, resumeIndex, totalStars } from '../game/progress.js';

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

// ——— 同频共振：设定层的文案 ———
// 全部从 wings.js 的 TIERS / SURGE 现算，不手写百分比：
// 界面说「火力 +125%」而表里其实只涨 35% 是最难查的一种骗人。

/** 阶级的设定名与代号：Mk.II 同频同步、Mk.III 相位共振。 */
export const tierTitle = (tier = 1) => tierOf(tier).title;
export const tierCodename = (tier = 1) => tierOf(tier).codename;
export const tierBrief = (tier = 1) => tierOf(tier).brief;

/** 升阶收益一句话。飘字、选翼面板、文档取的都是这一份。 */
export const tierGainLabel = (tier = 1) => {
  const step = tierOf(tier);
  const gain = (value) => `${value >= 1 ? '+' : '-'}${Math.round(Math.abs(value - 1) * 100)}%`;
  return `火力 ${gain(step.dmg)} · 射程/范围 ${gain(step.range)} · 冷却 ${gain(step.cool)}`;
};

/** HUD 上那一格先看过载倒计时，再看连消与进化提示。 */
export const surgeLabel = (ship) =>
  (ship?.overdrive ?? 0) > 0 ? `相位过载 ${ship.overdrive.toFixed(1)}s · 火力 ×${SURGE.dmg}` : '';

/** 共鸣条上的阶段说明（也给读屏用）。 */
export const syncLabel = (ship) => {
  if (!ship?.wing) return '';
  const step = tierOf(ship.tier ?? 1);
  return `${step.codename} ${step.name} · ${step.title}`;
};

// ——— 第二槽：装备（僚机）的文案 ———
// 刻意不叫「阶级」、不提「同频共振」：装备走的是编队数 1→3，
// 和机翼那条 Mk.I→III 的成长轴分开，HUD 上的词也得跟着分开。

export { gearLine };

/** 装备卡上的一句话：这一型长什么样、强在哪。 */
export const gearCardLine = (code) => gearLine(code);

/** HUD 那一格：型号、编队数、还有没有替挡机会（读屏也读这一句）。 */
export const gearLabel = (ship) => {
  if (!ship?.gear || !ship.gearLevel) return '无装备 · 关内可捡';
  const spec = GEAR[ship.gear];
  const guard = ship.gearGuard ? ' · 可替挡' : ' · 替挡已用';
  return `${spec.code} ${spec.name} ×${ship.gearLevel}${guard}`;
};

/** 编队格的说明：满编队与还能合流是两种状态。 */
export const gearMeterLabel = (ship) => {
  if (!ship?.gear) return '第二槽空着';
  const left = MAX_FORMATION - Math.max(0, ship.gearLevel ?? 0);
  return left > 0 ? `再捡同型号可合流 ${left} 架` : '编队已满';
};

/** 选翼面板上那句「可选」的说明：不新增一步弹窗，也不让人以为必须挑。 */
export const gearPanelHint = (codes) =>
  codes.length ? `可选 · 先带一架僚机（${codes.join(' / ')}）；不挑也能在关内捡到` : '';

/** 面板里那句「再捡一个会怎样」，满阶改说过载，不让人以为到顶就没用了。 */
export const nextTierLabel = (ship) => {
  if (!ship?.wing) return '';
  const tier = clampTier(ship.tier ?? 1);
  if (tier >= MAX_TIER) return `阶级封顶 · 再捡同型号触发 ${SURGE.title}（限时火力 ×${SURGE.dmg}）`;
  const next = tierOf(tier + 1);
  return `再捡一个 ${ship.wing} → ${next.name} ${next.title} · ${tierGainLabel(tier + 1)}`;
};

/** 世界观一句话：为什么只有同型号能升阶。 */
export const loreLine = () =>
  '机翼带相位编码：只有同型号能同频共振，第二副会解构成能量骨架，把机翼「展开」';

/**
 * 弃翼动作键的状态。主标签永远是「弃翼」（它是这一局唯一的战术输入，名字不该变），
 * 副行说清现在按下去会发生什么；tone 决定键亮成什么样：
 * on=随时可按（金），lock=刚接上还没解锁（蓝灰），off=没翼可弃（灰），dive=正在下潜（蓝，脉动）。
 */
export const jettisonKey = (ship) => {
  if (!ship.wing) {
    return {
      tone: ship.dive > 0 ? 'dive' : 'off',
      sub: ship.dive > 0 ? `下潜 ${ship.dive.toFixed(1)}s` : '无翼可弃',
    };
  }
  if (ship.lock > 0) return { tone: 'lock', sub: '锁定中' };
  return { tone: 'on', sub: '无敌 1s' };
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

// ——— 进度、容错与战报 ———
// 这几条文案对应「玩不下去」的三个真实原因：进度会丢、失败太贵、不知道自己怎么输的。

/** 章节过关的补给提示。只有跨章那一屏才有，不是每关都报喜。 */
export const supplyLabel = (state) =>
  state.status === 'clear' && isChapterEnd(state.levelIndex)
    ? `第 ${chapterNumber(state.levelIndex)} 章完成 · 下一章补给 ${CHAPTER_LIFE_BONUS} 条命`
    : '';

/** 失败战报：死在谁手上、离过还差多少。这一句比「任务失败」有用得多。 */
export const defeatLabel = (state) => {
  if (state.boss) {
    const left = Math.max(0, Math.round((state.boss.hp / state.boss.maxHp) * 100));
    return `${state.bossName} 还剩 ${left}% 体力`;
  }
  return '倒在 Boss 出场之前';
};

/** 一局的战绩数字。通关、失败、存档摘要都用这一份，免得三处各算一套。 */
export const runReport = (state) =>
  `击落 ${state.kills ?? 0} · 消弹 ${state.pops ?? 0} · 掉翼 ${state.wingLosses ?? 0} 次`;

/** 失败面板的主按钮：回本章第一关，而不是回第 1 关。 */
export const retryLabel = (state) => `重试第 ${chapterNumber(state.levelIndex)} 章`;

/** 标题页的存档摘要。没存档时返回 null，让 App 整块不渲染。 */
export const archiveLabel = (progress) => {
  if (!progress || !progress.unlocked) return null;
  const stars = totalStars(progress);
  const clears = progress.clears ?? 0;
  return `进度到第 ${resumeIndex(progress) + 1} 关 · ${stars} / ${maxStars()} 星 · 通关 ${clears} 次`;
};

/** 标题页主按钮：接着上次过掉的那一关继续。 */
export const resumeLabel = (progress) => `继续 · 第 ${resumeIndex(progress) + 1} 关`;

/** 分享文案。链接直接用当前地址——玩家本来就是点分享链接进来的。 */
export const shareText = (state, url) =>
  `我在《换翼S计划》打到第 ${state.levelIndex + 1} 关 · ${formatScore(state.score)} 分 ${starLabel(state.stars)}\n${url}`;

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
