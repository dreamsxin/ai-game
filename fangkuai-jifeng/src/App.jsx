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
} from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, createGame, startGame, step, togglePause } from './game/simulation.js';
import { MAGNET_SECONDS } from './game/rules.js';
import { createScene } from './scene/createScene.js';
import {
  comboLabel,
  crashReason,
  formatDistance,
  formatScore,
  formatSpeed,
  nextZoneLabel,
  starLabel,
  statusLabel,
  zoneLabel,
} from './scene/readout.js';

const BEST_KEY = 'fangkuai-jifeng:best';
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeBest = (score) => {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // 隐身模式下写不进 localStorage，不影响本局。
  }
};

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(randomSeed()));
  const padRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);

  const restart = useCallback(() => {
    gameRef.current = startGame(randomSeed());
    setView(gameRef.current);
  }, []);

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
        }
        gameRef.current = step(gameRef.current, merged, STEP);
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
  }, [pause]);
  // APPEND_APP_EFFECTS
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
      // APPEND_APP_JSX
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

      {(ready || paused || over) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>方块疾风</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>左右滑动变道，上滑或轻点跳跃，下滑滑铲</li>
                <li>木箱要跳，横杆要滑铲，整面墙只能变道</li>
                <li>连吃金币叠连击倍率，护盾可抵挡一次撞击</li>
              </ul>
            )}
            {over && (
              <>
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-stars">{starLabel(view.stars)}</p>
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


