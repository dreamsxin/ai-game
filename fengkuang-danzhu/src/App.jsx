import { useCallback, useEffect, useRef, useState } from 'react';
import { Flame, Pause, Play, RotateCcw, Target, Trophy, Volume2, VolumeX } from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { STEP, bricksLeft, createGame, restart as restartGame, startGame, step, togglePause } from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import { createAudio, vibrate, vibrationFor } from './scene/audio.js';
import {
  aimLabel,
  ballsLabel,
  bricksLabel,
  comboLabel,
  dangerLabel,
  dangerRatio,
  formatScore,
  formatTime,
  hpLabel,
  muteLabel,
  recordLabel,
  rewardLabel,
  stageLabel,
  statusLabel,
  turnLabel,
  turnSummary,
} from './scene/readout.js';

const BEST_KEY = 'fengkuang-danzhu:best';
const MUTE_KEY = 'fengkuang-danzhu:muted';
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
  // 音频引擎不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  const [banner, setBanner] = useState('');
  // 分数是实时写进最佳的，所以「有没有破纪录」得拿开局那一刻的旧纪录比。
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

  const again = useCallback(() => {
    bestAtStartRef.current = best;
    gameRef.current = restartGame(gameRef.current);
    setView(gameRef.current);
    setBanner('');
    ensureAudio().play('fire');
  }, [best, ensureAudio]);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      gameRef.current = { ...state, status: 'playing' };
      setView(gameRef.current);
      // 开始这一下就是本局第一个用户手势，正好拿它把 AudioContext 解锁。
      ensureAudio();
      return;
    }
    if (state.status === 'over') {
      again();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [again, ensureAudio]);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，瞄准手势只挂在场地上，HUD 按钮不会被当成开火。
    const keys = createInput(window, { pointer: false, onPause: pause });
    const touch = createInput(host, { keyboard: false });

    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastUiUpdate = 0;
    let lastUiStatus = gameRef.current.status;
    // effects 只在 status 是 playing 时才被 step 重建，暂停或结束后原样留在状态里。
    // 每帧照旧 notify 就会把最后那一批事件反复放一遍（粒子无上限堆积、结束音循环）。
    // elapsed 只在推进时才涨，拿它当 tick 标记正好。
    let lastEffectsAt = -1;

    const animate = (now) => {
      const frameDelta = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      accumulator += frameDelta;
      while (accumulator >= STEP) {
        const merged = mergeInput(keys.snapshot(), touch.snapshot());
        if (gameRef.current.status === 'ready' && merged.fire) {
          gameRef.current = { ...gameRef.current, status: 'playing' };
          // 直接在场地上拖一下就开打的那一局也要有声音。
          ensureAudio();
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        if (gameRef.current.elapsed !== lastEffectsAt) {
          lastEffectsAt = gameRef.current.elapsed;
          renderer.notify(gameRef.current.effects);
          // 出膛、砸砖、连爆、加珠、下压都从这一个出口出声。
          audioRef.current?.notify(gameRef.current.effects);
          vibrate(vibrationFor(gameRef.current.effects));
        }
        if (gameRef.current.lastTurn) setBanner(turnSummary(gameRef.current.lastTurn));
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
    };
  }, [ensureAudio, pause]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

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
  const over = view.status === 'over';
  const ready = view.status === 'ready';
  const danger = dangerRatio(view.grid) > 0.8;
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局实时刷过的 best 比。
  const record = over && view.score > bestAtStartRef.current;

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">{turnLabel(view.turn)} · {stageLabel(view.stage)}</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-balls">
            <Target size={14} aria-hidden="true" />
            {view.ballCount}
          </span>
          <span className="stat-label">{formatTime(view.elapsed)}</span>
        </div>
        <div className="stat stat-best">
          <Trophy size={14} aria-hidden="true" />
          <span className="stat-value">{formatScore(best)}</span>
        </div>
      </header>

      <div className="field">
        <div ref={hostRef} className="field-host" aria-label="弹珠场地" />
        {banner && <p className="banner">{banner}</p>}
      </div>

      <footer className="hud-bottom">
        <span className={`chip${danger ? ' chip-danger' : ''}`}>{dangerLabel(view.grid)}</span>
        <span className="chip">{bricksLabel(bricksLeft(view))}</span>
        {view.phase === 'aim' ? (
          <span className="chip">{aimLabel(view.aim)}</span>
        ) : (
          <span className="chip chip-combo">
            <Flame size={12} aria-hidden="true" />
            {comboLabel(view.turnDestroyed)}
          </span>
        )}
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

      {(ready || paused || over) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${over ? ' panel-settle' : ''}`}>
            <h1>疯狂打弹珠</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>在场地上拖动瞄准，松手射出一串弹珠；砖上的数字是还要挨几下</li>
                <li>吃到绿色加珠这一串就多一颗，弹珠越多一回合砸得越狠</li>
                <li>紫色炸弹砖碎的时候连带炸掉周围一圈，还能连锁引爆</li>
                <li>键盘：左右微调角度，空格开火，`Esc`/`P` 暂停</li>
                <li>每回合结束砖块下压一行，压到底线就结束</li>
                <li>一下带走的砖越多，砸碎那一声就越高；加珠的铃声完全是另一个音色</li>
              </ul>
            )}
            {over && (
              <>
                {record && <p className="panel-badge">{recordLabel(record)}</p>}
                <p className="panel-score">{formatScore(view.score)}</p>
                <p className="panel-detail">
                  撑到{turnLabel(view.turn)} · {stageLabel(view.stage)} · {ballsLabel(view.ballCount)}
                </p>
                <p className="panel-detail">
                  砸 {view.destroyed} 块 · 吃 {view.pickups} 颗加珠 · 单回合最多 {view.bestCombo} 块
                </p>
                <p className="panel-reward">{rewardLabel(view)}</p>
              </>
            )}
            {paused && (
              <p className="panel-detail">
                {hpLabel(view.grid)} · {ballsLabel(view.ballCount)}
              </p>
            )}
            <button type="button" className="panel-action" onClick={ready || paused ? pause : again}>
              {over ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {ready ? '开始游戏' : paused ? '继续' : '再来一局'}
            </button>
            {paused && (
              <button type="button" className="panel-link" onClick={again}>
                放弃这局，重新开始
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
