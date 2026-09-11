import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Pause, Play, RefreshCcw, RotateCcw, Target, Trophy } from 'lucide-react';
import { createArena } from './game/arena.js';
import { createInput, mergeInput } from './game/input.js';
import { MAX_HEALTH, SCORE_LIMIT, TEAM_ALLY, TEAM_ENEMY } from './game/rules.js';
import { STEP, createGame, startGame, step, togglePause } from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import {
  accuracyPercent,
  ammoLabel,
  focusLabel,
  formatScore,
  formatTime,
  goalLabel,
  healthRatio,
  kdLabel,
  killfeedText,
  lockLabel,
  reloadRatio,
  respawnLabel,
  rosterLine,
  statusLabel,
  streakLabel,
} from './scene/readout.js';

const BEST_KEY = 'xiaodui-qiangzhan:best';
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;
const ARENA_SIZE = createArena();

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
  const inputRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [focusOn, setFocusOn] = useState(false);

  const restart = useCallback(() => {
    gameRef.current = startGame(randomSeed());
    setView(gameRef.current);
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      gameRef.current = { ...state, status: 'playing' };
      setView(gameRef.current);
      return;
    }
    if (state.status === 'won' || state.status === 'over') {
      restart();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [restart]);

  const toggleFocus = useCallback(() => {
    setFocusOn((on) => {
      inputRef.current?.setFocus(!on);
      return !on;
    });
  }, []);

  const reload = useCallback(() => {
    inputRef.current?.pressReload();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，手势只挂在战场上，HUD 按钮不会被当成摇杆。
    const keys = createInput(window, { arena: ARENA_SIZE, pointer: false, onPause: pause });
    const touch = createInput(host, { arena: ARENA_SIZE, keyboard: false });
    inputRef.current = touch;

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
        if (gameRef.current.status === 'ready' && (merged.fire || merged.move.x || merged.move.y)) {
          gameRef.current = { ...gameRef.current, status: 'playing' };
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        accumulator -= STEP;
      }
      renderer.render(gameRef.current, frameDelta, touch.sticks());
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
      inputRef.current = null;
    };
  }, [pause]);

  useEffect(() => {
    if (view.stats.score <= best) return;
    setBest(view.stats.score);
    writeBest(view.stats.score);
  }, [view.stats.score, best]);

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

  const player = view.units.find((unit) => unit.id === view.playerId);
  const paused = view.status === 'paused';
  const ready = view.status === 'ready';
  const finished = view.status === 'won' || view.status === 'over';
  const allies = view.units.filter((unit) => unit.team === TEAM_ALLY);
  const enemies = view.units.filter((unit) => unit.team === TEAM_ENEMY);

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-team">
          <span className="stat-value ally">{view.score[TEAM_ALLY]}</span>
          <span className="stat-label">{goalLabel()}</span>
        </div>
        <div className="stat stat-clock">
          <span className="stat-value">{formatTime(view.timeLeft)}</span>
          <span className="stat-label">{kdLabel(view.stats)} · 命中 {accuracyPercent(view.stats)}</span>
        </div>
        <div className="stat stat-team">
          <span className="stat-value enemy">{view.score[TEAM_ENEMY]}</span>
          <span className="stat-label">{formatScore(view.stats.score)} 分</span>
        </div>
      </header>

      <div className="roster">
        <div className="roster-side">
          {allies.map((unit) => (
            <span key={unit.id} className={`tag ally${unit.alive ? '' : ' tag-down'}`}>
              {rosterLine(unit)}
            </span>
          ))}
        </div>
        <div className="roster-side roster-right">
          {enemies.map((unit) => (
            <span key={unit.id} className={`tag enemy${unit.alive ? '' : ' tag-down'}`}>
              {rosterLine(unit)}
            </span>
          ))}
        </div>
      </div>

      <div className="field">
        <div ref={hostRef} className="field-host" aria-label="战场：左半屏拖动移动，右半屏拖动瞄准开火" />
        <ul className="killfeed">
          {view.killfeed.map((entry) => (
            <li key={entry.id} className={entry.team === TEAM_ALLY ? 'ally' : 'enemy'}>
              {killfeedText(entry)}
            </li>
          ))}
        </ul>
        {player && !player.alive && <p className="banner">{respawnLabel(player)}</p>}
        {streakLabel(view.stats.streak) && <p className="streak">{streakLabel(view.stats.streak)}</p>}
      </div>

      <footer className="hud-bottom">
        <div className="vitals">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_HEALTH} aria-valuenow={Math.ceil(player?.health ?? 0)}>
            <i className="bar-life" style={{ width: `${healthRatio(player) * 100}%` }} />
          </div>
          <div className="bar bar-thin">
            <i className="bar-ammo" style={{ width: `${reloadRatio(player) * 100}%` }} />
          </div>
          <span className="vitals-text">
            {ammoLabel(player)} · {lockLabel(view.reticle)} {focusLabel(view.reticle)}
          </span>
        </div>
        <div className="actions">
          <button
            type="button"
            className={`act${focusOn ? ' act-on' : ''}`}
            onClick={toggleFocus}
            aria-pressed={focusOn}
            aria-label="端稳瞄准"
          >
            <Target size={18} aria-hidden="true" />
          </button>
          <button type="button" className="act" onClick={reload} aria-label="换弹">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
        </div>
      </footer>

      <button type="button" className="pause-key" onClick={pause} aria-label={paused ? '继续' : '暂停'}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>

      {(ready || paused || finished) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>小队枪战</h1>
            <p className="panel-status">{statusLabel(view)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>3v3 团队死斗，先到 {SCORE_LIMIT} 分或 3 分钟结束时领先的一方获胜</li>
                <li>触屏：左半屏拖动自由移动，右半屏拖动转枪口，推过一半自动开火</li>
                <li>键盘鼠标：`WASD` 移动，鼠标指向瞄准，左键开火，`Shift` 端稳，`R` 换弹，`Esc` 暂停</li>
                <li>视线内的敌人会被软锁：枪口被辅助拉过去，准星咬住时变金色</li>
                <li>端稳会收紧散布但走得更慢；跑动开枪最散，连发会抬枪</li>
              </ul>
            )}
            {finished && (
              <>
                <p className="panel-score">{formatScore(view.stats.score)}</p>
                <p className="panel-detail">
                  {kdLabel(view.stats)} · 命中率 {accuracyPercent(view.stats)} · 伤害 {Math.round(view.stats.damage)}
                </p>
                <p className="panel-detail">最长 {Math.max(1, view.stats.bestStreak)} 连杀 · 最佳 {formatScore(best)} 分</p>
              </>
            )}
            {paused && (
              <p className="panel-detail">
                <Crosshair size={13} aria-hidden="true" /> {lockLabel(view.reticle)} · 弹药 {ammoLabel(player)}
              </p>
            )}
            <button type="button" className="panel-action" onClick={pause}>
              {finished ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {ready ? '开始对战' : paused ? '继续' : '再来一局'}
            </button>
            {finished && (
              <p className="panel-hint">
                <Trophy size={13} aria-hidden="true" /> 历史最佳 {formatScore(best)} 分
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



