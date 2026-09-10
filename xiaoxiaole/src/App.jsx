import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { COLUMNS, ROWS } from './game/rules.js';
import { hasNextLevel } from './game/levels.js';
import { STEP, createGame, nextLevel, retryLevel, startGame, step, togglePause } from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import {
  clearLabel,
  formatScore,
  formatTime,
  goalLabel,
  levelLabel,
  movesLabel,
  progressPercent,
  remainLabel,
  starLabel,
  statusLabel,
} from './scene/readout.js';

const BEST_KEY = 'xiaoxiaole:best';
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
  const cursorRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [banner, setBanner] = useState('');

  const restart = useCallback(() => {
    gameRef.current = startGame(randomSeed(), gameRef.current.levelIndex);
    setView(gameRef.current);
    setBanner('');
  }, []);

  const advance = useCallback(() => {
    const state = gameRef.current;
    gameRef.current = state.status === 'won' ? nextLevel(state) : retryLevel(state);
    setView(gameRef.current);
    setBanner('');
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      gameRef.current = { ...state, status: 'playing' };
      setView(gameRef.current);
      return;
    }
    if (state.status === 'won' || state.status === 'over') {
      advance();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [advance]);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，手势只挂在棋盘上，HUD 按钮不会被当成拖动。
    const keys = createInput(window, { pointer: false, onPause: pause, columns: COLUMNS, rows: ROWS });
    const touch = createInput(host, { keyboard: false, columns: COLUMNS, rows: ROWS });

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
        cursorRef.current = merged.cursor ?? cursorRef.current;
        if (gameRef.current.status === 'ready' && (merged.tap || merged.swipe)) {
          gameRef.current = { ...gameRef.current, status: 'playing' };
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        if (gameRef.current.lastClear) setBanner(clearLabel(gameRef.current.lastClear));
        accumulator -= STEP;
      }
      renderer.render({ ...gameRef.current, cursor: cursorRef.current }, frameDelta);
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
      renderer.dispose();
    };
  }, [pause]);

  useEffect(() => {
    if (view.score <= best) return;
    setBest(view.score);
    writeBest(view.score);
  }, [view.score, best]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(''), 900);
    return () => clearTimeout(timer);
  }, [banner]);

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

  const paused = view.status === 'paused';
  const won = view.status === 'won';
  const over = view.status === 'over';
  const ready = view.status === 'ready';

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">{goalLabel(view.level)}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{movesLabel(view.moves)}</span>
          <span className="stat-label">{formatTime(view.elapsed)}</span>
        </div>
        <div className="stat stat-best">
          <Trophy size={14} aria-hidden="true" />
          <span className="stat-value">{formatScore(best)}</span>
        </div>
      </header>

      <div className="goal-row">
        <span className="goal-name">{levelLabel(view.level)}</span>
        <div
          className="goal-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent(view.score, view.level.target)}
        >
          <i style={{ width: `${progressPercent(view.score, view.level.target)}%` }} />
        </div>
      </div>

      <div className="board">
        <div ref={hostRef} className="board-host" aria-label="消消乐棋盘" />
        {banner && <p className="banner">{banner}</p>}
      </div>

      <footer className="hud-bottom">
        <span className="chip">{remainLabel(view.score, view.level.target)}</span>
        {view.bestChain > 1 && (
          <span className="chip chip-chain">
            <Sparkles size={12} aria-hidden="true" />
            最长 {view.bestChain} 连锁
          </span>
        )}
      </footer>

      <button type="button" className="pause-key" onClick={pause} aria-label={paused ? '继续' : '暂停'}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>

      {(ready || paused || won || over) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>甜果消消乐</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>{view.level.tip}</li>
                <li>棋盘上拖动相邻果实换位，也可以点一下选中、再点旁边交换</li>
                <li>键盘方向键移动光标，空格选中后按方向键换位</li>
              </ul>
            )}
            {(won || over) && (
              <>
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-stars">{starLabel(view.stars)}</p>
                <p className="panel-detail">
                  {levelLabel(view.level)} · 消 {view.cleared} 颗 · 最长 {Math.max(1, view.bestChain)} 连锁
                </p>
              </>
            )}
            {paused && <p className="panel-detail">{remainLabel(view.score, view.level.target)}</p>}
            <button type="button" className="panel-action" onClick={ready || paused ? pause : advance}>
              {over ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {ready ? '开始游戏' : paused ? '继续' : won ? (hasNextLevel(view.levelIndex) ? '下一关' : '再来一局') : '重试本关'}
            </button>
            {(won || over) && (
              <button type="button" className="panel-link" onClick={restart}>
                重玩本关
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
