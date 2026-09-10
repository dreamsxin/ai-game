import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Save,
  Trophy,
} from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, createGame, startGame, step, togglePause } from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import {
  clearLabel,
  formatScore,
  formatTime,
  levelLabel,
  nextLevelLabel,
  previewCells,
  starLabel,
  statusLabel,
} from './scene/readout.js';

const BEST_KEY = 'eluosi-fangkuai:best';
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

function Preview({ type, label }) {
  const { cells, width = 0, height = 0, color } = previewCells(type);
  return (
    <div className="preview">
      <span className="preview-label">{label}</span>
      <div
        className="preview-grid"
        style={{ gridTemplateColumns: `repeat(${width || 1}, 1fr)`, gridTemplateRows: `repeat(${height || 1}, 1fr)` }}
        aria-label={type ? `${label} ${type}` : `${label}空`}
      >
        {cells.map(([x, y]) => (
          <i key={`${x}-${y}`} style={{ gridColumn: x + 1, gridRow: y + 1, background: color }} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(randomSeed()));
  const padRef = useRef(null);
  const softRef = useRef(false);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [banner, setBanner] = useState('');

  const restart = useCallback(() => {
    gameRef.current = startGame(randomSeed());
    setView(gameRef.current);
    setBanner('');
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready' || state.status === 'over') {
      restart();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [restart]);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，手势只挂在棋盘上，HUD 按钮不会被当成拖动。
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
        if (softRef.current) merged.held.softDrop = true;
        const started = gameRef.current.status === 'ready'
          && (merged.rotateCW || merged.left || merged.right || merged.hardDrop);
        if (started) gameRef.current = { ...gameRef.current, status: 'playing' };
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        const clear = gameRef.current.lastClear;
        if (clear) setBanner(clearLabel(clear));
        accumulator -= STEP;
      }
      renderer.render(gameRef.current, frameDelta);
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
      padRef.current = null;
    };
  }, [pause]);
  useEffect(() => {
    if (view.status !== 'over') return;
    if (view.score <= best) return;
    setBest(view.score);
    writeBest(view.score);
  }, [view.status, view.score, best]);

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
  const act = (action) => () => padRef.current?.press(action);
  const holdSoft = (on) => () => {
    softRef.current = on;
  };
  const paused = view.status === 'paused';
  const over = view.status === 'over';
  const ready = view.status === 'ready';

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">得分</span>
        </div>
        <div className="stat">
          <span className="stat-value">{levelLabel(view.lines)}</span>
          <span className="stat-label">{view.lines} 行 · {formatTime(view.elapsed)}</span>
        </div>
        <div className="stat stat-best">
          <Trophy size={14} aria-hidden="true" />
          <span className="stat-value">{formatScore(best)}</span>
        </div>
      </header>

      <div className="board-row">
        <aside className="rail">
          <Preview type={view.hold} label="暂存" />
          {view.combo > 1 && <span className="chip chip-combo">{view.combo} 连击</span>}
          {view.backToBack && <span className="chip chip-b2b">B2B</span>}
        </aside>

        <div className="well">
          <div ref={hostRef} className="well-host" aria-label="俄罗斯方块棋盘" />
          {banner && <p className="banner">{banner}</p>}
        </div>


        <aside className="rail">
          {view.queue.slice(0, 3).map((type, index) => (
            <Preview key={`${type}-${index}`} type={type} label={index === 0 ? '下一个' : ''} />
          ))}
        </aside>
      </div>

      <nav className="pad" aria-label="触屏操作">
        <button type="button" className="pad-key" onPointerDown={act('left')} aria-label="左移">
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onPointerDown={act('rotateCCW')} aria-label="逆时针旋转">
          <RotateCcw size={22} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onPointerDown={act('rotateCW')} aria-label="顺时针旋转">
          <RotateCw size={22} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onPointerDown={act('right')} aria-label="右移">
          <ChevronRight size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="pad-key"
          onPointerDown={holdSoft(true)}
          onPointerUp={holdSoft(false)}
          onPointerCancel={holdSoft(false)}
          onPointerLeave={holdSoft(false)}
          aria-label="软降"
        >
          <ArrowDown size={22} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key pad-key-drop" onPointerDown={act('hardDrop')} aria-label="硬降">
          <ChevronDown size={26} aria-hidden="true" />
        </button>
        <button type="button" className="pad-key" onPointerDown={act('hold')} aria-label="暂存方块">
          <Save size={20} aria-hidden="true" />
        </button>
      </nav>

      <button type="button" className="pause-key" onClick={pause} aria-label={paused ? '继续' : '暂停'}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>

      {(ready || paused || over) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>方块坠塔</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>棋盘上轻点旋转，左右拖动移动，向下拖住软降</li>
                <li>快速下甩硬降，向上滑动把方块存进暂存区</li>
                <li>一次消四行拿 TETRIS，连续困难消行有 1.5 倍加成</li>
              </ul>
            )}
            {over && (
              <>
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-stars">{starLabel(view.stars)}</p>
                <p className="panel-detail">
                  {levelLabel(view.lines)} · {view.lines} 行 · {formatTime(view.elapsed)}
                </p>
              </>
            )}
            {!over && !ready && <p className="panel-detail">{nextLevelLabel(view.lines)}</p>}
            <button type="button" className="panel-action" onClick={over || ready ? restart : pause}>
              {over ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {over ? '再来一局' : ready ? '开始游戏' : '继续'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


