import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Pause, Play, RefreshCcw, RotateCcw, Target, Trophy, Volume2, VolumeX } from 'lucide-react';
import { createArena } from './game/arena.js';
import { createInput, mergeInput } from './game/input.js';
import { MAX_HEALTH, SCORE_LIMIT, TEAM_ALLY, TEAM_ENEMY } from './game/rules.js';
import { STEP, createGame, startGame, step, togglePause } from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import { createAudio, matchSound, vibrate, vibrationFor } from './scene/audio.js';
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
  muteLabel,
  recordLabel,
  reloadRatio,
  respawnLabel,
  rewardLabel,
  rosterLine,
  statusLabel,
  streakLabel,
} from './scene/readout.js';

const BEST_KEY = 'xiaodui-qiangzhan:best';
const MUTE_KEY = 'xiaodui-qiangzhan:muted';
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;
const ARENA_SIZE = createArena();

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
  const inputRef = useRef(null);
  // 音频引擎不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  const [focusOn, setFocusOn] = useState(false);
  // 分数在打的过程中会实时刷新最佳，所以「有没有破纪录」得拿开局那一刻的旧纪录比。
  const bestAtStartRef = useRef(readBest());
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
    ensureAudio().play('ready');
  }, [best, ensureAudio]);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      gameRef.current = { ...state, status: 'playing' };
      setView(gameRef.current);
      // 开打这一下就是本局第一个用户手势，正好拿它把 AudioContext 解锁。
      ensureAudio();
      return;
    }
    if (state.status === 'won' || state.status === 'over') {
      restart();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [ensureAudio, restart]);

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
          // 直接用键鼠或摇杆开打的那一局也要有声音，不能只有面板按钮那条路解锁音频。
          ensureAudio();
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        // 枪声、命中、挨枪、击杀都从这一个出口出声。
        audioRef.current?.notify(gameRef.current.effects);
        vibrate(vibrationFor(gameRef.current.effects));
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
  }, [ensureAudio, pause]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  // 比赛结束那一声在 effects 里没有对应事件（step 一到终局就直接返回了），所以按状态变化播。
  useEffect(() => {
    const name = matchSound(view.status);
    if (name) audioRef.current?.play(name);
  }, [view.status]);

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
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的 best 比。
  const record = finished && view.stats.score > bestAtStartRef.current;

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

      <button
        type="button"
        className="mute-key"
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muteLabel(muted)}
      >
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>


      {(ready || paused || finished) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${finished ? ' panel-settle' : ''}`}>
            <h1>小队枪战</h1>
            <p className="panel-status">{statusLabel(view)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>3v3 团队死斗，先到 {SCORE_LIMIT} 分或 3 分钟结束时领先的一方获胜</li>
                <li>触屏：左半屏拖动自由移动，右半屏拖动转枪口，推过一半自动开火</li>
                <li>键盘鼠标：`WASD` 移动，鼠标指向瞄准，左键开火，`Shift` 端稳，`R` 换弹，`Esc` 暂停</li>
                <li>视线内的敌人会被软锁：枪口被辅助拉过去，准星咬住时变金色</li>
                <li>端稳会收紧散布但走得更慢；跑动开枪最散，连发会抬枪</li>
                <li>自己的枪、别人的枪、打中人、被打中，四种声音各不相同</li>
              </ul>
            )}
            {finished && (
              <>
                {record && <p className="panel-badge">{recordLabel(record)}</p>}
                <p className="panel-score">{formatScore(view.stats.score)}</p>
                <p className="panel-detail">
                  {kdLabel(view.stats)} · 命中率 {accuracyPercent(view.stats)} · 伤害 {Math.round(view.stats.damage)}
                </p>
                <p className="panel-detail">最长 {Math.max(1, view.stats.bestStreak)} 连杀 · 最佳 {formatScore(best)} 分</p>
                <p className="panel-reward">{rewardLabel(view)}</p>
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



