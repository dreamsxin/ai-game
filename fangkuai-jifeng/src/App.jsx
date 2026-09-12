import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Coins,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, createGame, startGame, step, togglePause } from './game/simulation.js';
import { MAGNET_SECONDS } from './game/rules.js';
import { createScene } from './scene/createScene.js';
import { createAudio, vibrate, vibrationFor } from './scene/audio.js';
import {
  comboLabel,
  crashReason,
  formatDistance,
  formatScore,
  formatSpeed,
  muteLabel,
  nextZoneLabel,
  recordLabel,
  rewardLabel,
  starLabel,
  statusLabel,
  zoneLabel,
} from './scene/readout.js';


const BEST_KEY = 'fangkuai-jifeng:best';
const MUTE_KEY = 'fangkuai-jifeng:muted';
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;

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
  const gameRef = useRef(createGame(randomSeed()));
  const padRef = useRef(null);
  // 音频引擎不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  // 最高分在跑动过程中会被实时刷新，所以「有没有破纪录」得拿开局那一刻的旧纪录比。
  const bestAtStartRef = useRef(readBest());
  // 固定步长循环里要用当前静音状态，但那个 effect 不跟着 muted 重建，所以走 ref。
  const mutedRef = useRef(muted);

  // AudioContext 必须等用户手势才能起，所以统一在「本局第一个手势」这一刻懒建。
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudio({ muted: mutedRef.current });
    return audioRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      writeMuted(next);
      if (audioRef.current) audioRef.current.setMuted(next);
      return next;
    });
  }, []);


  const restart = useCallback(() => {
    bestAtStartRef.current = best;
    gameRef.current = startGame(randomSeed());
    setView(gameRef.current);
    // 面板上的按钮是本局第一个用户手势，正好拿它把 AudioContext 解锁。
    ensureAudio().play('jump');
  }, [best, ensureAudio]);


  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      restart();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [restart]);

  useEffect(() => {
    const host = hostRef.current;
    const scene = createScene(host);
    // 键盘挂在 window，指针只挂在场景上，HUD 按钮的点击不会被当成滑动手势。
    const keys = createInput(window, { pointer: false, onPause: pause });
    const touch = createInput(host, { keyboard: false });
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
        const merged = mergeInput(keys.snapshot(), touch.snapshot());
        if (gameRef.current.status === 'ready' && (merged.jump || merged.left || merged.right)) {
          gameRef.current = { ...gameRef.current, status: 'playing' };
          // 直接用键盘或滑动起跑的那一局也要有声音，不能只有面板按钮那条路解锁音频。
          ensureAudio();
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        // 变道、跳跃、金币、撞击都从这一个出口出声。
        audioRef.current?.notify(gameRef.current.effects);
        vibrate(vibrationFor(gameRef.current.effects));
        accumulator -= STEP;
      }

      scene.render(gameRef.current, now / 1000);
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
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      keys.dispose();
      touch.dispose();
      scene.dispose();
      padRef.current = null;
    };
  }, [ensureAudio, pause]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  useEffect(() => {
    if (view.status !== 'over') return;
    if (view.score <= best) return;
    setBest(view.score);
    writeBest(view.score);
  }, [view.status, view.score, best]);


  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && gameRef.current.status === 'playing') {
        gameRef.current = togglePause(gameRef.current);
        setView(gameRef.current);
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const act = (action) => () => padRef.current?.press(action);
  const combo = comboLabel(view.streak);
  const reason = crashReason(view.effects);
  const paused = view.status === 'paused';
  const over = view.status === 'over';
  const ready = view.status === 'ready';
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的 best 比。
  const record = over && view.score > bestAtStartRef.current;


  return (
    <div className="app">
      <div ref={hostRef} className="scene" aria-label="方块疾风三维跑酷场景" />

      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">得分</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatDistance(view.distance)}</span>
          <span className="stat-label">{zoneLabel(view.distance)} · {formatSpeed(view.speed)}</span>
        </div>
        <div className="stat stat-best">
          <Trophy size={14} aria-hidden="true" />
          <span className="stat-value">{formatScore(best)}</span>
        </div>
      </header>

      <div className="hud-side">
        <span className="chip">
          <Coins size={14} aria-hidden="true" /> {view.coinsCollected}
        </span>
        {view.shield > 0 && (
          <span className="chip chip-shield">
            <Shield size={14} aria-hidden="true" /> {view.shield}
          </span>
        )}
        {view.magnet > 0 && (
          <span className="chip chip-magnet">
            <Magnet size={14} aria-hidden="true" /> {view.magnet.toFixed(1)}s
            <i style={{ width: `${(view.magnet / MAGNET_SECONDS) * 100}%` }} />
          </span>
        )}
        {combo && <span className="chip chip-combo">{combo}</span>}
      </div>
      <nav className="pad" aria-label="触屏操作">
        <button type="button" className="pad-key" onPointerDown={act('left')} aria-label="向左变道">
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key pad-key-tall" onPointerDown={act('jump')} aria-label="跳跃">
          <ArrowUp size={26} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key pad-key-tall" onPointerDown={act('slide')} aria-label="滑铲">
          <ArrowDown size={26} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onPointerDown={act('right')} aria-label="向右变道">
          <ChevronRight size={26} aria-hidden="true" />
        </button>
      </nav>

      <button
        type="button"
        className="pause-key"
        onClick={pause}
        aria-label={paused ? '继续' : '暂停'}
      >
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

      {(ready || paused || over) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${over ? ' panel-settle' : ''}`}>
            <h1>方块疾风</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>左右滑动变道，上滑或轻点跳跃，下滑滑铲</li>
                <li>木箱要跳，横杆要滑铲，整面墙只能变道</li>
                <li>连吃金币叠连击倍率，护盾可抵挡一次撞击</li>
                <li>金币越串越高，护盾挡下那一声和撞毁完全不同</li>
              </ul>
            )}
            {over && (
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
                  {formatDistance(view.distance)} · 金币 {view.coinsCollected} · 最高连击 {view.bestStreak}
                </p>
                {reason && <p className="panel-reason">{reason}</p>}

              </>
            )}
            {!over && !ready && <p className="panel-detail">{nextZoneLabel(view.distance)}</p>}
            <button type="button" className="panel-action" onClick={over || ready ? restart : pause}>
              {over ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {over ? '再跑一次' : ready ? '开始奔跑' : '继续'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}


