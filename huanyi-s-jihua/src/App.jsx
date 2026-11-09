import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronsDown, Heart, Pause, Play, RotateCcw, Share2, Sparkles, Target, Trophy, Volume2, VolumeX } from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, advance, chooseWing, createGame, retryChapter, startGame, step, togglePause } from './game/simulation.js';
import { loadProgress, mergeProgress, resumeIndex, saveProgress } from './game/progress.js';
import { WINGS } from './game/wings.js';
import { GEAR, GEAR_CODES } from './game/gear.js';
import { bossAt, briefing, canSelect, levelAt } from './game/levels.js';
import { medalBonus } from './game/bounty.js';
import { createRenderer } from './scene/render.js';
import { VIBRATION, createAudio, vibrate, vibrationFor, winSound } from './scene/audio.js';
import {
  archiveLabel,
  bossRatio,
  bountyLabel,
  briefLine,
  chainLabel,
  defeatLabel,
  evolveLabel,
  formatScore,
  formatTime,
  gateLabel,
  gearLabel,
  gearMeterLabel,
  gearPanelHint,
  jettisonKey,
  labLabel,
  levelLabel,
  loreLine,
  medalBonusLabel,
  medalLabel,
  muteLabel,
  nextTierLabel,
  progressLabel,
  progressRatio,
  recordLabel,
  resultTitle,
  resumeLabel,
  retryLabel,
  rewardLabel,
  runReport,
  shareText,
  starLabel,
  statusLabel,
  supplyLabel,
  surgeLabel,
  syncLabel,
  tierGainLabel,
  tierLabel,
  weakHint,
  wingClass,
  wingLabel,
  wingLine,
  wingName,
} from './scene/readout.js';
import { wingIcon } from './scene/wingIcon.js';
import { createLoop } from './scene/loop.js';
import { HAZARD, TIER_COLOR, gearSkin } from './scene/palette.js';

const BEST_KEY = 'huanyi-s-jihua:best';
const MUTE_KEY = 'huanyi-s-jihua:muted';

/**
 * 选翼卡片上的机翼小图。形状由 `wingIcon(code)` 从这只机翼真正的火力配置算出来，
 * 和场上那副三维机翼同源——所以「挑的时候看到的」就是「飞起来带的」：
 * 翼型（八种轮廓）、几路火力、扇形张多宽、炸弹挂不挂、有没有那圈护环，一眼分得开。
 */
function WingIcon({ code }) {
  const art = wingIcon(code);
  const { skin, box, ring } = art;
  return (
    <svg className="wing-art" viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={`${code} 机翼外形`}>
      {/* 环形护翼：那一圈铁球才是它真正的武器，所以环画在机身之前（在它身后转）。 */}
      {ring && (
        <>
          <ellipse
            cx={ring.cx}
            cy={ring.cy}
            rx={ring.rx}
            ry={ring.ry}
            fill="none"
            stroke={skin.lead}
            strokeWidth="0.8"
            strokeDasharray="3 2"
            opacity="0.75"
          />
          {Array.from({ length: ring.orbs }, (_, index) => {
            const angle = (Math.PI * 2 * index) / ring.orbs - Math.PI / 2;
            return (
              <circle
                key={index}
                cx={ring.cx + Math.cos(angle) * ring.rx}
                cy={ring.cy + Math.sin(angle) * ring.ry}
                r={ring.r}
                fill="#d8d8e6"
                stroke={skin.lead}
                strokeWidth="0.8"
              />
            );
          })}
        </>
      )}
      {art.panels.map((points, index) => (
        <polygon key={index} points={points} fill={skin.body} stroke={skin.edge} strokeWidth="1" />
      ))}
      <polygon points={art.hull} fill="#2b3a6e" stroke={skin.lead} strokeWidth="0.8" />
      {art.leads.map((lead, index) => (
        <line key={index} {...lead} stroke={skin.lead} strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {/* 翼尖装置：和场上那件是同一份数据（wingTrim），所以卡片上就能看出「这一型翼尖上多了什么」。 */}
      {art.fins.map((fin, index) => (
        <line
          key={index}
          x1={fin.x1}
          y1={fin.y1}
          x2={fin.x2}
          y2={fin.y2}
          stroke={skin.chrome}
          strokeWidth={fin.w}
          strokeLinecap="round"
          opacity="0.9"
        />
      ))}
      {art.pods.map((pod, index) => (
        <circle key={index} cx={pod.x} cy={pod.y} r={pod.r} fill={skin.chrome} stroke={skin.lead} strokeWidth="1" />
      ))}
      {art.tips.map((tip, index) => (
        <rect key={index} x={tip.x} y={tip.y} width={tip.w} height={tip.h} rx="1" fill={TIER_COLOR[0]} />
      ))}
      {art.barrels.map((barrel, index) => (
        <line
          key={index}
          x1={barrel.x1}
          y1={barrel.y1}
          x2={barrel.x2}
          y2={barrel.y2}
          stroke={skin.chrome}
          strokeWidth={barrel.width}
          strokeLinecap="round"
        />
      ))}
      {art.bombs.map((bomb, index) => (
        <circle key={index} cx={bomb.x} cy={bomb.y} r={bomb.r} fill={HAZARD.ground} />
      ))}
      {art.parts.map((part, index) =>
        part.kind === 'echo' ? (
          <rect
            key={index}
            x={part.x - part.r}
            y={part.y - part.r}
            width={part.r * 2}
            height={part.r * 2}
            fill="#e0d0ff"
            transform={`rotate(45 ${part.x} ${part.y})`}
          />
        ) : part.kind === 'bulb' ? (
          <circle key={index} cx={part.x} cy={part.y} r={part.r} fill="#ffd0f0" />
        ) : (
          <circle
            key={index}
            cx={part.x}
            cy={part.y}
            r={part.r}
            fill="none"
            stroke={part.kind === 'well' ? HAZARD.lab : part.kind === 'coil' ? '#b8f0ff' : skin.lead}
            strokeWidth="1.4"
          />
        ),
      )}
    </svg>
  );
}

/**
 * 装备卡的小图：六边形收纳舱 + 一型一件识别件。
 * 形状与机翼卡的菱形翼面完全不同，扫一眼就知道这是第二槽而不是又一只翅膀。
 */
function GearIcon({ code }) {
  const spec = GEAR[code];
  const skin = gearSkin(code);
  return (
    <svg className="gear-art" viewBox="0 0 48 48" role="img" aria-label={`${code} 装备外形`}>
      <polygon points="24,3 42,13 42,35 24,45 6,35 6,13" fill={skin.body} stroke={skin.lead} strokeWidth="1.4" />
      <polygon points="24,9 37,16 37,32 24,39 11,32 11,16" fill="none" stroke={skin.edge} strokeWidth="1" />
      {spec.shape === 'swept' && (
        <>
          <path d="M24 14 L11 30 M24 14 L37 30" stroke={skin.chrome} strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="14" r="2.4" fill={skin.lead} />
        </>
      )}
      {spec.shape === 'needle' && (
        <path d="M24 9 L24 39 M18 18 L30 18 M18 34 L30 34" stroke={skin.chrome} strokeWidth="2" strokeLinecap="round" />
      )}
      {spec.shape === 'ring' && (
        <>
          <ellipse cx="24" cy="24" rx="12" ry="7" fill="none" stroke={skin.lead} strokeWidth="2" />
          <circle cx="24" cy="24" r="3" fill={skin.chrome} />
        </>
      )}
    </svg>
  );
}

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeBest = (score) => {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // 隐身模式下写不进 localStorage，不影响本局。
  }
};

const writeMuted = (muted) => {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // 同上：存不下静音偏好也不该影响这一局。
  }
};

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(0));
  const padRef = useRef(null);
  // 音频引擎不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  // 进度存档只记「打到哪、每关几星、通关几次」。局内状态一概不存：
  // 存了就等于把「一命到底」的紧张感一起存下来（见 progress.js 的注释）。
  const [progress, setProgress] = useState(loadProgress);
  // 复制战绩的三态：idle / ok / fail。fail 时把文案摆出来让人手动复制。
  const [copyState, setCopyState] = useState('idle');
  const [banner, setBanner] = useState('');
  // 选翼面板上「先带哪一型僚机」的预选。它只是这一屏的 UI 状态，
  // 不进 game state、不进存档；按出击时才随 chooseWing 一起生效。
  const [presetGear, setPresetGear] = useState(null);
  // 表现层挂掉时的提示。黑屏本身不说话，这行字替它说。
  const [fault, setFault] = useState('');
  // 触屏和键盘是两套母语：提示、快捷键都按「这只手是什么」切换。
  // 没有 matchMedia 就当触屏——这游戏本来就是触屏优先。
  const [coarse, setCoarse] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : true,
  );
  // 最高分在结算时才写盘，但仍要拿开局那一刻的旧纪录比，重开一局才不会误报破纪录。
  const bestAtStartRef = useRef(readBest());

  const sound = useCallback((name) => {
    if (!audioRef.current) audioRef.current = createAudio({ muted });
    return audioRef.current.play(name);
  }, [muted]);

  const push = useCallback((next) => {
    gameRef.current = next;
    setView(next);
  }, []);

  const restart = useCallback(() => {
    bestAtStartRef.current = best;
    // 第 1 关是选翼关，所以重开一局就落在选翼界面上。
    push(startGame(0));
    setPresetGear(null);
    setBanner('');
    setCopyState('idle');
    // 面板上的按钮是本局第一个用户手势，正好拿它把 AudioContext 解锁。
    sound('catch');
  }, [best, push, sound]);

  /**
   * 继续上次的进度：接着上次过掉的那一关。
   * 落点若不是章首（机制上不能选翼），就替它带上这一关的推荐机翼直接开打——
   * 「继续」不该把人按回本章开头重打四关。
   */
  const resume = useCallback(() => {
    const index = resumeIndex(progress);
    bestAtStartRef.current = best;
    push(startGame(index, canSelect(index) ? null : briefing(index).pick));
    setBanner('');
    setCopyState('idle');
    sound('catch');
  }, [best, progress, push, sound]);

  /** 失败后只回本章，不用把前面十几关重打一遍。 */
  const retry = useCallback(() => {
    bestAtStartRef.current = best;
    push(retryChapter(gameRef.current));
    setBanner('');
    setCopyState('idle');
    sound('catch');
  }, [best, push, sound]);

  const share = useCallback(async () => {
    const url = typeof location === 'undefined' ? '' : location.href;
    try {
      await navigator.clipboard.writeText(shareText(gameRef.current, url));
      setCopyState('ok');
    } catch {
      // http 域名、旧版 Safari、被拒绝授权：剪贴板用不了就把文案摆出来让人手动复制。
      setCopyState('fail');
    }
  }, []);

  const pick = useCallback((code) => {
    push(chooseWing(gameRef.current, code, presetGear));
    sound('catch');
  }, [presetGear, push, sound]);

  const next = useCallback(() => {
    setCopyState('idle');
    push(advance(gameRef.current));
  }, [push]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const value = !current;
      writeMuted(value);
      if (audioRef.current) audioRef.current.setMuted(value);
      return value;
    });
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'over' || state.status === 'won') {
      // 键盘 Esc / P 在结算屏上等于主按钮：失败回本章，通关再来一趟。
      if (state.status === 'over') retry();
      else restart();
      return;
    }
    if (state.status === 'ready') {
      // 有存档就从上次那一章接上，没有才从头开始。
      if (progress.unlocked > 0) resume();
      else restart();
      return;
    }
    if (state.status === 'clear') {
      next();
      return;
    }
    if (state.status === 'select') return;
    push(togglePause(state));
  }, [next, progress.unlocked, push, restart, resume, retry]);

  // 暂停回调走 ref：渲染循环那个 effect 必须只挂一次。
  // 把 pause 写进 deps 会让它随 best 变化重建——而重建一次就是新开一个 WebGL 上下文，
  // 开几次浏览器就不再给了，画面直接黑屏（2D 版无所谓，3D 版是致命的）。
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  const restartRef = useRef(restart);
  useEffect(() => {
    restartRef.current = restart;
  }, [restart]);

  // 触屏换键盘（插鼠标、接手写板）时把提示换掉。
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(pointer: coarse)');
    const onChange = (event) => setCoarse(event.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // PC 的两枚快捷键。走位、弃翼、暂停归 input.js 管；静音和重开是纯 UI 动作，归这里。
  // M 随时可用；R 只在暂停和结算时接手——打起来的时候误按 R 重开一局就太贵了。
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return;
      if (event.code === 'KeyM') {
        setMuted((current) => {
          const value = !current;
          writeMuted(value);
          if (audioRef.current) audioRef.current.setMuted(value);
          return value;
        });
        return;
      }
      if (event.code === 'KeyR') {
        const status = gameRef.current.status;
        if (status === 'paused' || status === 'over' || status === 'won') restartRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    // 表现层起不来就说出来。以前它一挂只表现为「黑屏 + 选了机翼没动作」：
    // 面板是 React 画的，照样能点，但世界不动——最难查的就是这种一声不响的失败。
    let renderer;
    try {
      renderer = createRenderer(host);
    } catch (error) {
      console.error('[stage] 表现层没起来', error);
      setFault(String(error?.message ?? error));
      return undefined;
    }
    // 键盘挂在 window，手势只挂在舞台上，HUD 上的按钮不会被当成走位拖动。
    const keys = createInput(window, { pointer: false, onPause: () => pauseRef.current?.() });
    // 走位换算问渲染层要：2.5D 里一个像素等于几格要看船现在多深，
    // 照「场地高 / 画布高」这种平均值算，竖着拖会比手指慢四成。
    const touch = createInput(host, {
      keyboard: false,
      scale: () => renderer.dragScale(gameRef.current.ship.y),
    });
    padRef.current = touch;

    // 主循环交给 loop.js：它保证「时间在走、帧在跑」——rAF 缺席（无头、内嵌 webview、
    // 省电模式）就自动落到 setTimeout 上，rAF 回来再交还。这里只管每帧做什么。
    let accumulator = 0;
    let lastUiUpdate = 0;
    let lastUiStatus = gameRef.current.status;

    const loop = createLoop((dt) => {
      accumulator += dt;
      while (accumulator >= STEP) {
        touch.tick(STEP);
        const merged = mergeInput(keys.snapshot(), touch.snapshot());
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        // 消弹、弃翼、打进弱点都从这一个出口出声，和渲染层读的是同一批 effects。
        audioRef.current?.notify(gameRef.current.effects);
        vibrate(vibrationFor(gameRef.current.effects));
        accumulator -= STEP;
      }

      // 手指位置交给渲染层画拖动指示：按下去画面毫无反应，玩家会以为不能触摸操控。
      renderer.render(gameRef.current, dt, touch.pointers());
      const now = performance.now();
      if (now - lastUiUpdate > 90 || gameRef.current.status !== lastUiStatus) {
        setView(gameRef.current);
        lastUiUpdate = now;
        lastUiStatus = gameRef.current.status;
      }
    });
    // 先画一帧再进循环：万一环境连 setTimeout 都掐着，至少画面上有场地而不是一整块黑
    // ——「黑屏」这种症状太容易被当成程序崩了。
    renderer.render(gameRef.current, 0, []);
    loop.start();

    return () => {
      loop.stop();
      keys.dispose();
      touch.dispose();
      renderer.dispose();
      padRef.current = null;
    };
    // 只挂一次：WebGL 上下文和后处理的渲染目标都是重家伙，不能跟着 state 重建。
  }, []);

  useEffect(() => {
    if (view.status !== 'over' && view.status !== 'won') return;
    if (view.score <= best) return;
    setBest(view.score);
    writeBest(view.score);
  }, [view.status, view.score, best]);

  // 过关就落盘。over 不写：失败不该改变「已经解锁到哪」，那是玩家已经拿到的旅程。
  // stamp 去重是因为 clear 会停留好几秒，React 重渲染不该把同一关反复写一遍。
  const savedRef = useRef('');
  useEffect(() => {
    if (view.status !== 'clear' && view.status !== 'won') return;
    const stamp = `${view.status}:${view.levelKey}:${view.score}:${view.stars}`;
    if (savedRef.current === stamp) return;
    savedRef.current = stamp;
    setProgress((current) => {
      const merged = mergeProgress(current, view);
      saveProgress(merged);
      return merged;
    });
  }, [view.status, view.levelKey, view.score, view.stars]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  // over 和 won 是状态跳转而不是 effect，所以这两声在这里补。
  useEffect(() => {
    if (view.status === 'won') {
      sound(winSound(view.stars));
      vibrate(VIBRATION.win);
      return;
    }
    if (view.status === 'over') {
      sound('over');
      vibrate(VIBRATION.over);
    }
  }, [view.status, view.stars, sound]);

  // 进新关时闪一下关卡名和 Boss 弱点，让玩家知道这一关在考什么。
  useEffect(() => {
    if (view.status !== 'playing') return;
    setBanner(`${levelLabel(view)} · ${weakHint(view.weak)}`);
  }, [view.levelKey, view.status]);

  // 跳关门开了要喊一嗓子。它是「省 4 关，可 Boss 一点没削弱」的风险决策，
  // 却闷声出现在波次刚清完的空档里——不喊，玩家根本不知道场上那道门能撞。
  const gateOpen = view.status === 'playing' && Boolean(view.gate);
  useEffect(() => {
    if (!gateOpen) return;
    setBanner(gateLabel(view.gate));
    // 只在「没开 → 开了」这一跳上报。门开着的时候 gate 每帧都是新对象，不能跟着跑。
  }, [gateOpen]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(''), 1800);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return;
      // 切出去时把按住的手指清账：不清的话回来船会自己一直往一个方向走。
      padRef.current?.clear();
      if (gameRef.current.status === 'playing') push(togglePause(gameRef.current));
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [push]);

  const ready = view.status === 'ready';
  const selecting = view.status === 'select';
  const paused = view.status === 'paused';
  const cleared = view.status === 'clear';
  const finished = view.status === 'over' || view.status === 'won';
  const overlay = ready || selecting || paused || cleared || finished;
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的 best 比。
  const record = finished && view.score > bestAtStartRef.current;
  const brief = briefing(view.levelIndex);
  const medals = view.bounty?.medals ?? 0;
  const hp = bossRatio(view);
  const jettison = jettisonKey(view.ship);
  const surge = surgeLabel(view.ship);
  // 跨章那一屏才有的补给提示；存档摘要只在真有进度时出现。
  const supply = cleared ? supplyLabel(view) : '';
  const archive = archiveLabel(progress);
  const hasSave = progress.unlocked > 0;

  return (
    <div className="app">
      {/* 画面铺满屏幕，HUD 浮在它上面：竖版射击最值钱的就是纵向那点空间，
          HUD 占一行等于把提前量削掉一截。 */}
      <div className="frame">
        <div className="stage">
          <div ref={hostRef} className="stage-host" aria-label="换翼S计划关卡" />
          <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">{progressLabel(view)}</span>
          {/* 勋章是关内目标：攒到几枚必须一直看得见，才知道这一命值不值得拿来换。
              竖向多一行而不是横向多一格——窄屏上 HUD 三块本来就贴边了。 */}
          {medals > 0 && <span className="stat-label stat-medals">{medalLabel(medals)}</span>}
        </div>
        <div className="stat stat-row">
          <Heart size={14} aria-hidden="true" />
          <span className="stat-value">{view.lives}</span>
          <Sparkles size={14} aria-hidden="true" />
          <span className="stat-value">{view.pops}</span>
        </div>
        <div className="stat">
          <span className={`stat-value${view.ship.wing ? '' : ' stat-bare'}`}>{wingLabel(view.ship)}</span>
          <span className="stat-label">
            {surge || chainLabel(view.chain) || evolveLabel(view.ship) || brief.label}
          </span>
        </div>
        </header>

        {/* 共鸣条：三格就是三阶，过载时整条换白青并脉动。
            阶级跟着机翼走，裸机时它必须一起灭，否则 HUD 会在骗人。
            面板打开时两条 meter 一起收起来：它们会透出半透明遮罩，
            和「选择机翼」的标题挤成一团糊字。 */}
        {!overlay && (<>
        <div className={`sync-meter${surge ? ' sync-meter-surge' : ''}`} aria-label={syncLabel(view.ship) || '无机翼'}>
          <span className="sync-meter-name">
            {view.ship.wing ? syncLabel(view.ship) : '无机翼 · 无相位场'}
          </span>
          <span className="sync-meter-pips" aria-hidden="true">
            {[1, 2, 3].map((step) => (
              <i
                key={step}
                className={view.ship.wing && view.ship.tier >= step ? 'pip-on' : ''}
                style={{
                  borderColor: TIER_COLOR[step - 1],
                  background: view.ship.wing && view.ship.tier >= step ? TIER_COLOR[step - 1] : 'transparent',
                }}
              />
            ))}
          </span>
        </div>

        {/* 第二槽：编队数与这一关还剩的替挡机会。空槽也写一句「关内可捡」，
            别让这一行凭空消失——玩家得知道还有个槽没用上。 */}
        <div
          className={`gear-meter${view.ship.gear ? '' : ' gear-meter-empty'}`}
          aria-label={`${gearLabel(view.ship)} · ${gearMeterLabel(view.ship)}`}
        >
          <span className="gear-meter-name">{gearLabel(view.ship)}</span>
          <span className="gear-meter-pips" aria-hidden="true">
            {[1, 2, 3].map((step) => {
              const skin = gearSkin(view.ship.gear);
              const on = Boolean(view.ship.gear) && view.ship.gearLevel >= step;
              return (
                <i
                  key={step}
                  className={on ? 'pip-on' : ''}
                  style={{ borderColor: skin.lead, background: on ? skin.lead : 'transparent' }}
                />
              );
            })}
          </span>
        </div>
        </>)}

        {fault && <p className="fault">表现层没起来：{fault}　·　刷新页面重试</p>}
        {banner && <p className="banner">{banner}</p>}
        {hp !== null && (
          <div className="boss-bar" aria-label={`${view.bossName} 剩余体力`}>
            <span className="boss-name">{view.bossName}</span>
            <i style={{ width: `${Math.round(hp * 100)}%` }} />
          </div>
        )}
        <div className="progress" aria-hidden="true">
          <i style={{ width: `${Math.round(progressRatio(view, bossAt(levelAt(view.levelIndex))) * 100)}%` }} />
        </div>

        {/* 弃翼动作键照手游的样子摆在右下拇指老家：大圆钮、亮的时候一眼知道能按。
            但它**不吃指针事件**：走位是全屏拖动，一块能吞手势的钮摆在拇指老家
            就等于在最常按的地方开了个死区（从它上面起手拖动，船不动）。
            关掉 pointer-events 之后点它照样弃翼——事件穿到画布上，那本来就是「轻点即弃翼」。
            所以它的职责是看得见 + 说清状态（可弃／锁定／无翼／下潜中）。 */}
        <div className="pad" aria-hidden="true">
          <span className={`pad-key pad-key-${jettison.tone}`}>
            <ChevronsDown size={26} strokeWidth={2.6} />
            <b>弃翼</b>
            <i>{jettison.sub}</i>
          </span>
        </div>

        <button type="button" className="pause-key" onClick={pause} aria-label={paused ? '继续' : '暂停'}>
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="mute-key"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muteLabel(muted)}
        >
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
        </div>
      </div>

      {overlay && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${finished || cleared ? ' panel-settle' : ''}${selecting ? ' panel-wide' : ''}`}>
            <h1>{finished ? resultTitle(view.status) : selecting ? '选择机翼 · 第 2 步' : '换翼S计划'}</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {/* 键盘玩家的快捷键摆在暂停里：这一屏停下来喘口气，正好看得进去。 */}
            {paused && !coarse && <p className="panel-detail">Esc / P 继续 · R 重新开始 · M 静音</p>}
            {paused && view.ship.wing && (
              <p className="panel-detail">{syncLabel(view.ship)} · {tierGainLabel(view.ship.tier)}</p>
            )}
            {paused && <p className="panel-detail">{nextTierLabel(view.ship)}</p>}

            {ready && (
              <>
                {/* 首屏只放三句：怎么动、怎么保命、为什么翅膀重要。
                    其余设定收进折叠区——手机上一长串说明会把「出击」顶到屏幕外，
                    等于让第一次打开的人先读说明书、再找按钮。 */}
                <ul className="panel-tips">
                  <li>
                    {coarse
                      ? '按住屏幕任意处拖动走位，火力一直是自动开的'
                      : '方向键 / WASD 走位，火力一直是自动开的'}
                  </li>
                  <li>
                    {coarse
                      ? '轻点一下弃翼：机翼脱落，主机下潜 1 秒无敌，但只剩小炮'
                      : 'Space / Z / X / J 弃翼下潜：机翼脱落，1 秒无敌，但只剩小炮'}
                  </li>
                  <li>带着翼被打中只掉翼，裸机被打中才掉命——翅膀就是你的装甲</li>
                </ul>

                <details className="panel-more">
                  <summary>更多设定与操作</summary>
                  <ul className="panel-tips">
                    <li>斜俯视 2.5D 战场：往上是远方，敌人从地平线那头压过来</li>
                    <li>脱下来的翅膀会往上飘，接回来还能用；飘出画面就真没了</li>
                    <li><b>同频共振</b>：只有同型号能叠。Mk.II 火力 +50%，Mk.III +125%，射程与范围一起变长</li>
                    <li>叠翼瞬间放一圈相位冲击震碎附近敌弹；满阶再叠触发限时「相位过载」</li>
                    <li>机翼会随阶级展开成能量翼；换型号编码不兼容，从 Mk.I 重来</li>
                    <li>敌弹可以被打掉，连消越多分越高、音越亮</li>
                    <li><b>僚机编队</b>：关内打掉运载火箭能捡到装备，同型号合流到 3 架；三型各自左右伴飞 / 前方游猎 / 环绕索敌，游猎僚机还会发射会拐弯的巡航导弹；裸机挨致命一击时会替你挡一下（消耗一架）</li>
                    <li>打不进弱点的那一声又钝又闷，听到它就说明这只翅膀选错了</li>
                    <li>第 9 关起解锁实验机翼：引力井、链弧炮、相位激光、反物质弹、量子分身</li>
                    {!coarse && <li>Esc / P 暂停 · R 重开 · M 静音</li>}
                  </ul>
                </details>

                {/* 有存档的人最该先看到「接着上次打」，而不是最高分。 */}
                {archive && <p className="panel-detail panel-archive">{archive}</p>}
                {/* 旧纪录放在标题页：目标是什么，出发前就该看见。 */}
                {best > 0 && (
                  <p className="panel-detail panel-best">
                    <Trophy size={13} aria-hidden="true" /> 最高 {formatScore(best)}
                  </p>
                )}
              </>
            )}

            {selecting && (
              <>
                <p className="panel-brief">{briefLine(brief)}</p>
                <p className="panel-detail">{weakHint(brief.weak)}</p>
                {/* 先给一个默认出击键：两层面板长得太像，玩家点完「出击」看到选翼面板
                    很容易以为卡在原地。这个键让「不想挑」的人一步入场。 */}
                <button type="button" className="panel-action" onClick={() => pick(brief.pick)}>
                  <Play size={18} aria-hidden="true" />
                  带 {brief.pick} {WINGS[brief.pick].name} 出击
                </button>

                {/* 装备仍在同一屏、不新增一步弹窗：手机上多一次点击就是一次流失。
                    摆在出击键正下方而不是机翼列表之后——那里要滚一屏才看得到，
                    等于把「还能带僚机」藏了起来。它是可选的，默认空槽；关内照样能捡到。 */}
                <div className="gear-row">
                  <p className="panel-detail">{gearPanelHint(GEAR_CODES)}</p>
                  <div className="gear-grid">
                    <button
                      type="button"
                      className={`gear-card${presetGear === null ? ' gear-card-on' : ''}`}
                      aria-pressed={presetGear === null}
                      onClick={() => setPresetGear(null)}
                    >
                      <span className="gear-card-blank">＋</span>
                      <b>空槽</b>
                      <span>关内再捡</span>
                    </button>
                    {GEAR_CODES.map((code) => (
                      <button
                        type="button"
                        key={code}
                        className={`gear-card${presetGear === code ? ' gear-card-on' : ''}`}
                        aria-pressed={presetGear === code}
                        onClick={() => setPresetGear(code)}
                      >
                        <GearIcon code={code} />
                        <b>{code} {GEAR[code].name}</b>
                        <span>{GEAR[code].title}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="panel-detail panel-lab">{labLabel(brief.lab)}</p>
                {/* 版面情报：进关之前先知道这一关要背几波全歼，别打完了才发现有勋章这回事。 */}
                {brief.bounties > 0 && <p className="panel-detail">{bountyLabel(brief.bounties)}</p>}
                <p className="panel-detail">或者自己挑一只（{brief.codes.length} 种可选，往下滑看全部）</p>
                <div className="wing-grid">
                  {brief.codes.map((code) => (
                    <button
                      type="button"
                      key={code}
                      className={`wing-card${code === brief.pick ? ' wing-card-pick' : ''}${WINGS[code].lab ? ' wing-card-lab' : ''}`}
                      onClick={() => pick(code)}
                    >
                      {/* 机翼列表要看得见机翼：名字和说明是文字，形状才是这一套火力的样子。 */}
                      <WingIcon code={code} />
                      <b>
                        {code}
                        <i className="wing-card-tag">{wingClass(code)}</i>
                      </b>
                      <span className="wing-card-name">{WINGS[code].name}</span>
                      <span className="wing-card-desc">{wingLine(code)}</span>
                    </button>
                  ))}
                </div>

                <p className="panel-detail">
                  <Sparkles size={13} aria-hidden="true" /> {loreLine()}
                </p>
                <p className="panel-detail">
                  <Target size={13} aria-hidden="true" /> 这一关的运载火箭里装着 {brief.drops.join(' / ')}
                  ；同型号叠上去就升阶，翼面会真的展开。装备主题 {brief.gearCodes.join(' / ')}
                </p>
              </>
            )}

            {cleared && (
              <>
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-detail">
                  {levelLabel(view)} · {view.skipped ? '走了跳关门，直接省 4 关' : `击破 ${view.bossName}`}
                </p>
                <p className="panel-detail">{runReport(view)} · 最长连消 {view.bestChain}</p>
                {/* 关末把公式摊开：勋章 × 保住的阶级。玩家下次才知道该拿命换什么。 */}
                {medals > 0 && (
                  <p className="panel-detail panel-medals">
                    <Trophy size={13} aria-hidden="true" />{' '}
                    {medalBonusLabel(medals, view.ship.tier, medalBonus(medals, view.ship.tier))}
                  </p>
                )}
                <p className="panel-detail">
                  现在挂着 {wingName(view.ship.wing)}
                  {tierLabel(view.ship.tier) ? ` ${tierLabel(view.ship.tier)}` : ''}
                </p>
                {/* 跨章补给要当面说：玩家该知道「下一章多一条命」是他打完这一章换来的。 */}
                {supply && (
                  <p className="panel-detail panel-supply">
                    <Heart size={13} aria-hidden="true" /> {supply}
                  </p>
                )}
                <button type="button" className="panel-action" onClick={next}>
                  <ChevronRight size={18} aria-hidden="true" />
                  继续推进
                </button>
              </>
            )}

            {finished && (
              <>
                {record && <p className="panel-badge">{recordLabel(record)}</p>}
                <p className="panel-score">{formatScore(view.score)}</p>
                {/* 星星逐颗弹出来，一次性全亮就没有「攒到了」的感觉。 */}
                <p className="panel-stars" aria-label={`获得 ${view.stars} 星`}>
                  {starLabel(view.stars).split('').map((mark, index) => (
                    <i
                      key={index}
                      className={mark === '★' ? 'star-on' : 'star-off'}
                      style={{ animationDelay: `${index * 180}ms` }}
                      aria-hidden="true"
                    >
                      {mark}
                    </i>
                  ))}
                </p>
                <p className="panel-detail">{rewardLabel(view.stars)}</p>
                {/* 失败最需要的不是「任务失败」，而是「你还差多少」。 */}
                {view.status === 'over' && <p className="panel-detail panel-defeat">{defeatLabel(view)}</p>}
                <p className="panel-detail">
                  {levelLabel(view)} · {runReport(view)} · 用时 {formatTime(view.elapsed)}
                </p>
                {view.retried > 0 && <p className="panel-detail">这一章重试过 {view.retried} 次</p>}
                <p className="panel-detail">
                  <Trophy size={13} aria-hidden="true" /> 最高 {formatScore(best)}
                </p>
                {/* 分享是这游戏唯一「出圈」的部分：一句话拉人进来比谁飞得远。 */}
                <button type="button" className="panel-action panel-action-ghost" onClick={share}>
                  <Share2 size={16} aria-hidden="true" />
                  {copyState === 'ok' ? '已复制，发出去吧' : copyState === 'fail' ? '复制失败，请手动复制' : '复制战绩'}
                </button>
                {copyState === 'fail' && (
                  <p className="panel-share-text">
                    {shareText(view, typeof location === 'undefined' ? '' : location.href)}
                  </p>
                )}
              </>
            )}

            {!selecting && !cleared && (
              <div className="panel-actions">
                {ready &&
                  (hasSave ? (
                    <>
                      <button type="button" className="panel-action" onClick={resume}>
                        <Play size={18} aria-hidden="true" />
                        {resumeLabel(progress)}
                      </button>
                      <button type="button" className="panel-action panel-action-ghost" onClick={restart}>
                        <RotateCcw size={18} aria-hidden="true" />
                        从第 1 关重来
                      </button>
                    </>
                  ) : (
                    <button type="button" className="panel-action" onClick={restart}>
                      <Play size={18} aria-hidden="true" />
                      出击
                    </button>
                  ))}

                {paused && (
                  <>
                    <button type="button" className="panel-action" onClick={pause}>
                      <Play size={18} aria-hidden="true" />
                      继续
                    </button>
                    {/* 暂停里的退路只退到本章：接个电话、挑错机翼，不该罚掉前面十几关。 */}
                    <button type="button" className="panel-action panel-action-ghost" onClick={retry}>
                      <RotateCcw size={18} aria-hidden="true" />
                      重开本章
                    </button>
                  </>
                )}

                {finished &&
                  (view.status === 'won' ? (
                    <button type="button" className="panel-action" onClick={restart}>
                      <RotateCcw size={18} aria-hidden="true" />
                      再来一趟
                    </button>
                  ) : (
                    <>
                      {/* 失败的主按钮是「留在这一章」：回第 1 关重打十几关，是弃坑的第一步。 */}
                      <button type="button" className="panel-action" onClick={retry}>
                        <RotateCcw size={18} aria-hidden="true" />
                        {retryLabel(view)}
                      </button>
                      <button type="button" className="panel-action panel-action-ghost" onClick={restart}>
                        从第 1 关重来
                      </button>
                    </>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
