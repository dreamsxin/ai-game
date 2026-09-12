import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { createInput, mergeInput } from './game/input.js';
import { hasNextLevel } from './game/levels.js';
import { COLOR_HEX, colorLabel } from './game/marbles.js';
import { MAX_GROOVE_COMBO } from './game/rules.js';
import {
  STEP,
  chooseColor,
  createGame,
  marblesLeft,
  nextLevel,
  retryLevel,
  startGame,
  step,
  togglePause,
} from './game/simulation.js';
import { createRenderer } from './scene/render.js';
import { createAudio, vibrate, vibrationFor } from './scene/audio.js';

import {
  ammoLabel,
  bpmLabel,
  clearLabel,
  formatScore,
  formatTime,
  goalLabel,
  grooveLabel,
  levelLabel,
  livesLabel,
  marbleLabel,
  muteLabel,
  pressureRatio,
  progressPercent,
  recordLabel,
  remainLabel,
  rewardLabel,
  starLabel,
  statusLabel,
  waveLabel,
} from './scene/readout.js';

const BEST_KEY = 'lvdong-danzhu:best';
const MUTE_KEY = 'lvdong-danzhu:muted';
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
  // 最高分在游戏过程中会被实时刷新，所以「有没有破纪录」得拿开局那一刻的旧纪录比。
  const bestAtStartRef = useRef(readBest());

  const sound = useCallback((name) => {
    if (!audioRef.current) audioRef.current = createAudio({ muted });
    return audioRef.current.play(name);
  }, [muted]);

  const restart = useCallback(() => {
    bestAtStartRef.current = best;
    gameRef.current = startGame(randomSeed(), gameRef.current.levelIndex);
    setView(gameRef.current);
    setBanner('');
    sound('launch');
  }, [best, sound]);

  const advance = useCallback(() => {
    const state = gameRef.current;
    bestAtStartRef.current = best;
    gameRef.current = state.status === 'won' ? nextLevel(state) : retryLevel(state);
    setView(gameRef.current);
    setBanner('');
    sound('launch');
  }, [best, sound]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      writeMuted(next);
      if (audioRef.current) audioRef.current.setMuted(next);
      return next;
    });
  }, []);

  const pause = useCallback(() => {
    const state = gameRef.current;
    if (state.status === 'ready') {
      bestAtStartRef.current = best;
      gameRef.current = { ...state, status: 'playing' };
      setView(gameRef.current);
      // 「开始游戏」是本局第一个用户手势，正好拿它把 AudioContext 解锁。
      sound('launch');
      return;
    }
    if (state.status === 'won' || state.status === 'over') {
      advance();
      return;
    }
    gameRef.current = togglePause(state);
    setView(gameRef.current);
  }, [advance, best, sound]);


  const pickColor = useCallback((index) => {
    gameRef.current = chooseColor(gameRef.current, index);
    setView(gameRef.current);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const renderer = createRenderer(host);
    // 键盘挂在 window，手势只挂在场地上，HUD 按钮不会被当成拖挡板。
    const keys = createInput(window, { pointer: false, onPause: pause });
    const touch = createInput(host, { keyboard: false });

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
        if (gameRef.current.status === 'ready' && merged.tap) {
          gameRef.current = { ...gameRef.current, status: 'playing' };
        }
        gameRef.current = step(gameRef.current, merged, STEP);
        renderer.notify(gameRef.current.effects);
        // 节拍、接球、连消都从这一个出口出声，和渲染层读的是同一批 effects。
        audioRef.current?.notify(gameRef.current.effects, MAX_GROOVE_COMBO);
        vibrate(vibrationFor(gameRef.current.effects, MAX_GROOVE_COMBO));
        if (gameRef.current.lastClear) setBanner(clearLabel(gameRef.current.lastClear));
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
  }, [pause]);

  useEffect(() => {
    if (view.score <= best) return;
    setBest(view.score);
    writeBest(view.score);
  }, [view.score, best]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);


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
  // 拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的 best 比。
  const record = (won || over) && view.score > bestAtStartRef.current;


  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(view.score)}</span>
          <span className="stat-label">{goalLabel(view.level)}</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-lives" aria-label={livesLabel(view.lives)}>
            {Array.from({ length: view.lives }, (_, i) => (
              <Heart key={i} size={13} aria-hidden="true" />
            ))}
          </span>
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

      <div className="field">
        <div ref={hostRef} className="field-host" aria-label="弹珠场地" />
        {banner && <p className="banner">{banner}</p>}
      </div>

      <div className="ammo-row" role="group" aria-label="选择上膛颜色">
        {view.colors.map((color, index) => (
          <button
            key={color}
            type="button"
            className={`ammo${index === view.colorIndex ? ' ammo-on' : ''}`}
            style={{ background: COLOR_HEX[color] }}
            onClick={() => pickColor(index)}
            aria-label={`上膛${colorLabel(color)}`}
            aria-pressed={index === view.colorIndex}
          />
        ))}
      </div>

      <footer className="hud-bottom">
        <span className="chip">{waveLabel(view.wavesLeft)}</span>
        {/* 墙压得越低这颗越警示，配合画布上的虚线提醒越线风险。 */}
        <span className={`chip${pressureRatio(view.grid) > 0.72 ? ' chip-danger' : ''}`}>
          {marbleLabel(marblesLeft(view))}
        </span>
        {view.combo > 0 && (
          <span className="chip chip-groove">
            <Zap size={12} aria-hidden="true" />
            {grooveLabel(view.combo)}
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

      {(ready || paused || won || over) && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`panel${won || over ? ' panel-settle' : ''}`}>
            <h1>律动弹珠</h1>
            <p className="panel-status">{statusLabel(view.status)}</p>
            {ready && (
              <ul className="panel-tips">
                <li>{view.level.tip}</li>
                <li>拖动场地移挡板，点一下发球；飞行中点一下换上膛颜色</li>
                <li>键盘左右移动，空格发球/换色，`Esc`/`P` 暂停</li>
                <li>{bpmLabel(view.level)} · 每 {view.level.descendBeats} 拍挤进一行弹珠</li>
                <li>踩着拍子接球才攒律动倍率——现在拍子是听得见的</li>
              </ul>
            )}
            {(won || over) && (
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
                  {levelLabel(view.level)} · 消 {view.cleared} 颗 · 掉落 {view.dropped} 颗 · 最长 {Math.max(1, view.bestChain)} 连消
                </p>
                <p className="panel-detail">最高 {view.bestCombo} 连拍律动</p>
              </>
            )}

            {paused && <p className="panel-detail">{remainLabel(view.score, view.level.target)}</p>}
            {!ready && !paused && <p className="panel-detail">{ammoLabel(view.paddleColor)}</p>}
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
