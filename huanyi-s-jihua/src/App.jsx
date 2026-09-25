import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Heart, Pause, Play, RotateCcw, Sparkles, Target, Trophy, Volume2, VolumeX } from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, advance, chooseWing, createGame, startGame, step, togglePause } from './game/simulation.js';
import { WINGS } from './game/wings.js';
import { bossAt, briefing, levelAt } from './game/levels.js';
import { createRenderer } from './scene/render.js';
import { VIBRATION, createAudio, vibrate, vibrationFor, winSound } from './scene/audio.js';
import {
  bossRatio,
  briefLine,
  chainLabel,
  evolveLabel,
  formatScore,
  formatTime,
  jettisonLabel,
  labLabel,
  levelLabel,
  muteLabel,
  progressLabel,
  progressRatio,
  recordLabel,
  resultTitle,
  rewardLabel,
  starLabel,
  statusLabel,
  tierLabel,
  weakHint,
  wingClass,
  wingLabel,
  wingLine,
  wingName,
} from './scene/readout.js';

const BEST_KEY = 'huanyi-s-jihua:best';
const MUTE_KEY = 'huanyi-s-jihua:muted';

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
  const [banner, setBanner] = useState('');
  // 表现层挂掉时的提示。黑屏本身不说话，这行字替它说。
  const [fault, setFault] = useState('');
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
    setBanner('');
    // 面板上的按钮是本局第一个用户手势，正好拿它把 AudioContext 解锁。
    sound('catch');
  }, [best, push, sound]);

  const pick = useCallback((code) => {
    push(chooseWing(gameRef.current, code));
    sound('catch');
  }, [push, sound]);

  const next = useCallback(() => {
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
      restart();
      return;
    }
    if (state.status === 'ready') {
      bestAtStartRef.current = best;
      push(startGame(0));
      return;
    }
    if (state.status === 'clear') {
      next();
      return;
    }
    if (state.status === 'select') return;
    push(togglePause(state));
  }, [best, next, push, restart]);

  // 暂停回调走 ref：渲染循环那个 effect 必须只挂一次。
  // 把 pause 写进 deps 会让它随 best 变化重建——而重建一次就是新开一个 WebGL 上下文，
  // 开几次浏览器就不再给了，画面直接黑屏（2D 版无所谓，3D 版是致命的）。
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

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

    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastUiUpdate = 0;
    let lastUiStatus = gameRef.current.status;

    const animate = (now) => {
      const frameDelta = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      accumulator += frameDelta;
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
      renderer.render(gameRef.current, frameDelta, touch.pointers());
      if (now - lastUiUpdate > 90 || gameRef.current.status !== lastUiStatus) {
        setView(gameRef.current);
        lastUiUpdate = now;
        lastUiStatus = gameRef.current.status;
      }
    };
    const schedule = () => {
      frame = requestAnimationFrame((now) => {
        animate(now);
        schedule();
      });
    };
    // 先画一帧再进循环：万一 rAF 被浏览器掐着（后台标签、省电模式、无头环境），
    // 至少画面上有场地而不是一整块黑——「黑屏」这种症状太容易被当成程序崩了。
    renderer.render(gameRef.current, 0, []);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
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

  const jettison = () => padRef.current?.press('jettison');

  const ready = view.status === 'ready';
  const selecting = view.status === 'select';
  const paused = view.status === 'paused';
  const cleared = view.status === 'clear';
  const finished = view.status === 'over' || view.status === 'won';
  const overlay = ready || selecting || paused || cleared || finished;
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的 best 比。
  const record = finished && view.score > bestAtStartRef.current;
  const brief = briefing(view.levelIndex);
  const hp = bossRatio(view);

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
        </div>
        <div className="stat stat-row">
          <Heart size={14} aria-hidden="true" />
          <span className="stat-value">{view.lives}</span>
          <Sparkles size={14} aria-hidden="true" />
          <span className="stat-value">{view.pops}</span>
        </div>
        <div className="stat">
          <span className={`stat-value${view.ship.wing ? '' : ' stat-bare'}`}>{wingLabel(view.ship)}</span>
          <span className="stat-label">{chainLabel(view.chain) || evolveLabel(view.ship) || brief.label}</span>
        </div>
        </header>

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

        {/* 三个键都贴在舞台内的右下角：它们是这块画面的操作，不该再去偷一整行高度。
            注意它们是 stage-host 的兄弟节点，所以按键不会同时被算成一次「画布轻点」。 */}
        <nav className="pad" aria-label="触屏操作">
          <button
            type="button"
            className={`pad-key pad-jettison${view.ship.wing ? '' : ' pad-key-off'}`}
            onPointerDown={jettison}
            aria-label={jettisonLabel(view.ship)}
          >
            {jettisonLabel(view.ship)}
          </button>
        </nav>

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

            {ready && (
              <ul className="panel-tips">
                <li>屏幕任意处按住拖动走位，火力一直是自动开的</li>
                <li>斜俯视 2.5D 战场：往上是远方，敌人从地平线那头压过来</li>
                <li>轻点一下弃翼：机翼脱落，主机下潜 1 秒无敌，但只剩小炮</li>
                <li>脱下来的翅膀会往上飘，接回来还能用；飘出画面就真没了</li>
                <li>带着翼被打中只掉翼，裸机被打中才掉命——翅膀就是你的装甲</li>
                <li>捡到<b>同型号</b>的机翼就升阶，Mk.III 火力翻一截；换型号从 Mk.I 重来</li>
                <li>敌弹可以被打掉，连消越多分越高、音越亮</li>
                <li>打不进弱点的那一声又钝又闷，听到它就说明这只翅膀选错了</li>
                <li>第 9 关起解锁实验机翼：引力井、链弧炮、相位激光、反物质弹、量子分身</li>
              </ul>
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
                <p className="panel-detail panel-lab">{labLabel(brief.lab)}</p>
                <p className="panel-detail">或者自己挑一只（{brief.codes.length} 种可选，往下滑看全部）</p>
                <div className="wing-grid">
                  {brief.codes.map((code) => (
                    <button
                      type="button"
                      key={code}
                      className={`wing-card${code === brief.pick ? ' wing-card-pick' : ''}${WINGS[code].lab ? ' wing-card-lab' : ''}`}
                      onClick={() => pick(code)}
                    >
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
                  <Target size={13} aria-hidden="true" /> 这一关的运载火箭里装着 {brief.drops.join(' / ')}
                  ；捡到同型号就升阶
                </p>
              </>
            )}

            {cleared && (
              <>
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-detail">
                  {levelLabel(view)} · {view.skipped ? '走了跳关门，直接省 4 关' : `击破 ${view.bossName}`}
                </p>
                <p className="panel-detail">
                  消弹 {view.pops} 发 · 最长连消 {view.bestChain} · 现在挂着 {wingName(view.ship.wing)}
                  {tierLabel(view.ship.tier) ? ` ${tierLabel(view.ship.tier)}` : ''}
                </p>
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
                <p className="panel-detail">
                  {levelLabel(view)} · 消弹 {view.pops} · 击落 {view.kills} · 用时 {formatTime(view.elapsed)}
                </p>
                <p className="panel-detail">
                  <Trophy size={13} aria-hidden="true" /> 最高 {formatScore(best)}
                </p>
              </>
            )}

            {!selecting && !cleared && (
              <button type="button" className="panel-action" onClick={finished || ready ? restart : pause}>
                {finished ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                {finished ? '再来一趟' : ready ? '出击' : '继续'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
