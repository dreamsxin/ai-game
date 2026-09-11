import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
  Lightbulb,
  Play,
  RotateCcw,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { AXIS_COL, AXIS_ROW, LEVEL_COUNT, WALK_SECONDS_PER_CELL } from './game/rules.js';
import { createInput } from './game/input.js';
import {
  countHint,
  createGame,
  hint,
  nextLevel,
  restartLevel,
  selectCell,
  setLayer,
  shift,
  shiftAnchor,
  tapCell,
  undo,
} from './game/simulation.js';
import { createScene } from './scene/createScene.js';
import { winRevealDelay } from './scene/motion.js';
import {
  VIBRATION,
  createAudio,
  soundsFor,
  vibrate,
  vibrationFor,
  winSound,
} from './scene/audio.js';
import {
  TUTORIAL_STEPS,
  coachLine,
  effectMessage,
  hintLabel,
  layerLabel,
  levelLabel,
  lineLabel,
  muteLabel,
  parLabel,
  progressLabel,
  recordLabel,
  rewardLabel,
  shiftLabel,
  sizeLabel,
  starLabel,
  statusLabel,
  undoLabel,
  winComment,
} from './scene/readout.js';

const STARS_KEY = 'migong-chuansuo:stars';
const TAUGHT_KEY = 'migong-chuansuo:taught';
const MUTE_KEY = 'migong-chuansuo:muted';

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;
const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐身模式下写不进 localStorage，不影响本局。
  }
};

export default function App() {
  const hostRef = useRef(null);
  const gameRef = useRef(createGame(0, randomSeed()));
  // 手指按住的格子只喂给渲染层，每帧读一次，不进游戏状态。
  const focusRef = useRef(null);
  // 音频引擎跟着 ref 走：它不参与渲染，放进 state 只会白白多一轮重渲染。
  const audioRef = useRef(null);
  const [view, setView] = useState(gameRef.current);
  const [focusCell, setFocusCell] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [stars, setStars] = useState(() => readJson(STARS_KEY, {}));
  const [guide, setGuide] = useState(() => !readJson(TAUGHT_KEY, false));
  const [celebrate, setCelebrate] = useState(false);
  const [muted, setMuted] = useState(() => readJson(MUTE_KEY, false));
  const [record, setRecord] = useState(false);

  // AudioContext 只建一次，并且建完就把当前静音状态同步进去。
  const sound = useCallback((name) => {
    if (!audioRef.current) audioRef.current = createAudio({ muted });
    return audioRef.current.play(name);
  }, [muted]);

  const soundAll = useCallback((names) => {
    if (names.length === 0) return;
    if (!audioRef.current) audioRef.current = createAudio({ muted });
    audioRef.current.playAll(names);
  }, [muted]);

  const focus = useCallback((cell) => {
    focusRef.current = cell;
    setFocusCell(cell);
  }, []);

  // 权威状态在 ref 里，React state 只是 HUD 的镜像：回合制不需要每帧重渲染。
  // 每一次真正的状态推进都从这里过，所以音效和触感也挂在这里，不会漏掉任何一条路径。
  const apply = useCallback((next) => {
    if (next === gameRef.current) return;
    gameRef.current = next;
    setView(next);
    setAdvice(null);
    soundAll(soundsFor(next.effects));
    vibrate(vibrationFor(next.effects));
  }, [soundAll]);

  const load = useCallback((index, seed) => {
    gameRef.current = createGame(index, seed);
    setView(gameRef.current);
    setAdvice(null);
    setCelebrate(false);
    setRecord(false);
    sound('restart');
  }, [sound]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      writeJson(MUTE_KEY, next);
      if (audioRef.current) audioRef.current.setMuted(next);
      return next;
    });
  }, []);

  const closeGuide = useCallback(() => {
    setGuide(false);
    writeJson(TAUGHT_KEY, true);
    // 关引导是本局第一个用户手势，正好拿它把 AudioContext 解锁。
    sound('select');
  }, [sound]);

  const onAction = useCallback((action) => {
    const state = gameRef.current;
    const anchor = shiftAnchor(state, focusRef.current);
    if (action === 'left') apply(shift(state, AXIS_ROW, anchor.row, -1));
    else if (action === 'right') apply(shift(state, AXIS_ROW, anchor.row, 1));
    else if (action === 'up') apply(shift(state, AXIS_COL, anchor.col, -1));
    else if (action === 'down') apply(shift(state, AXIS_COL, anchor.col, 1));
    else if (action === 'undo') apply(undo(state));
    else if (action === 'restart') apply(restartLevel(state));
    else if (action === 'layerUp') apply(setLayer(state, state.activeLayer + 1));
    else if (action === 'layerDown') apply(setLayer(state, state.activeLayer - 1));
    else if (action === 'hint') {
      // 提示除了给一句话，还顺手把那条线选中：光带亮起来，方向键就直接对着它了。
      const found = hint(state);
      let next = countHint(state);
      if (found.move) {
        next = selectCell(next, {
          layer: state.activeLayer,
          col: found.move.axis === AXIS_COL ? found.move.index : anchor.col,
          row: found.move.axis === AXIS_ROW ? found.move.index : anchor.row,
        });
      }
      gameRef.current = next;
      setView(next);
      setAdvice(found);
      sound('hint');
    }
  }, [apply, sound]);


  useEffect(() => {
    const host = hostRef.current;
    const scene = createScene(host);

    const onPress = ({ x, y }) => focus(scene.pick(x, y));
    const onRelease = () => focus(null);
    const onTap = ({ x, y }) => {
      const cell = scene.pick(x, y);
      if (cell) apply(tapCell(gameRef.current, cell));
    };
    // 相机不转，屏幕横轴就是列方向、纵轴就是行方向，所以横滑推行、竖滑推列。
    const onDrag = ({ x, y, axis, sign }) => {
      const cell = scene.pick(x, y);
      if (!cell) return;
      if (axis === 'x') apply(shift(gameRef.current, AXIS_ROW, cell.row, sign));
      else apply(shift(gameRef.current, AXIS_COL, cell.col, sign));
    };

    const touch = createInput(host, { onTap, onDrag, onPress, onRelease, keyboard: false });
    const keys = createInput(window, { onAction, pointer: false });
    let frame = 0;
    const schedule = () => {
      frame = requestAnimationFrame((now) => {
        scene.render(gameRef.current, now / 1000, focusRef.current);
        schedule();
      });
    };
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      touch.dispose();
      keys.dispose();
      scene.dispose();
    };
  }, [apply, focus, onAction]);

  // 卸载时关掉 AudioContext。浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  // 破纪录要在写盘之前判：写完 best 就等于新星数，再比就永远比不出来了。
  useEffect(() => {
    if (view.status !== 'won') {
      setRecord(false);
      return;
    }
    const best = stars[view.levelIndex] ?? 0;
    if (view.stars <= best) return;
    setRecord(true);
    const next = { ...stars, [view.levelIndex]: view.stars };
    setStars(next);
    writeJson(STARS_KEY, next);
  }, [view.status, view.stars, view.levelIndex, stars]);

  // 结算面板等角色走完最后一段再弹，不然整段走位动画都被盖在面板后面。
  // 通关和弦、震动也跟着这一拍走：声音先于画面到会显得「还没走到就赢了」。
  useEffect(() => {
    if (view.status !== 'won') {
      setCelebrate(false);
      return;
    }
    const delay = winRevealDelay(view.effects, WALK_SECONDS_PER_CELL) * 1000;
    const timer = setTimeout(() => {
      setCelebrate(true);
      sound(winSound(view.stars));
      vibrate(VIBRATION.win);
    }, delay);
    return () => clearTimeout(timer);
  }, [view.status, view.tick, view.stars, sound]);


  // 路况提示是一次性的，留在屏幕上会和下一步的判断打架。
  // 清的时候连 ref 一起清：否则镜像和权威状态会岔开，下一次 apply 的同一性判断就不可信了。
  useEffect(() => {
    if (!effectMessage(view.effects)) return;
    const timer = setTimeout(() => {
      setView((current) => {
        const cleared = { ...current, effects: [] };
        if (gameRef.current.tick === current.tick) gameRef.current = cleared;
        return cleared;
      });
    }, 1800);
    return () => clearTimeout(timer);
  }, [view.tick, view.effects]);
  const anchor = shiftAnchor(view, focusCell);
  const coach = coachLine(view);
  const message = advice ? hintLabel(advice) : effectMessage(view.effects) ?? coach;
  const opened = view.effects.some((effect) => effect.type === 'open');
  const bestStars = stars[view.levelIndex] ?? 0;

  const totalStars = Object.values(stars).reduce((sum, value) => sum + value, 0);
  const hasNext = view.levelIndex + 1 < LEVEL_COUNT;
  const act = (action) => () => onAction(action);

  return (
    <div className="app">
      <div ref={hostRef} className="scene" aria-label="迷宫穿越三维体素场景" />

      <header className="hud-top">
        <div className="stat">
          <span className="stat-value">{levelLabel(view.levelIndex)}</span>
          <span className="stat-label">{sizeLabel(view.level)} · {parLabel(view.level.par)}</span>
        </div>
        <div className="stat stat-shifts">
          <span className="stat-value">{shiftLabel(view.shifts, view.level.par)}</span>
          <span className="stat-label">推移步数</span>
        </div>
        <div className="stat stat-best" aria-label={`已收集星数 ${progressLabel(totalStars)}`}>
          <Trophy size={14} aria-hidden="true" />
          <span className="stat-value">{progressLabel(totalStars)}</span>
        </div>
      </header>

      <div className="hud-side">
        <span className="chip">{statusLabel(view.status)}</span>
        {view.level.layers > 1 && (
          <span className="chip chip-layer">
            <Layers size={14} aria-hidden="true" /> {layerLabel(view.activeLayer, view.level.layers)}
          </span>
        )}
        {bestStars > 0 && <span className="chip chip-star">{starLabel(bestStars)}</span>}
        <button type="button" className="chip chip-help" onClick={() => setGuide(true)}>
          <HelpCircle size={14} aria-hidden="true" /> 玩法
        </button>
        <button
          type="button"
          className="chip chip-help"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muteLabel(muted)}
        >
          {muted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
          {muted ? '静音' : '音效'}
        </button>
      </div>

      {message && (
        <p
          className={`toast${coach && !advice ? ' toast-coach' : ''}${opened ? ' toast-open' : ''}`}
          role="status"
        >
          {message}
        </p>
      )}

      {view.level.layers > 1 && (
        <nav className="layers" aria-label="切换楼层">
          {Array.from({ length: view.level.layers }, (unused, layer) => (
            <button
              key={layer}
              type="button"
              className={`layer-key${layer === view.activeLayer ? ' layer-key-on' : ''}`}
              onClick={() => apply(setLayer(gameRef.current, layer))}
              aria-pressed={layer === view.activeLayer}
            >
              {layer + 1}
            </button>
          ))}
        </nav>
      )}

      <div className="pad">
        <div className="pad-tools">
          <button
            type="button"
            className="pad-key"
            onClick={act('undo')}
            disabled={view.history.length === 0 || view.status !== 'playing'}
            aria-label={undoLabel(view.history.length)}
          >
            <Undo2 size={20} aria-hidden="true" />
            {view.history.length > 0 && <b className="pad-badge">{view.history.length}</b>}
          </button>

          <button type="button" className="pad-key" onClick={act('hint')} aria-label="求提示">
            <Lightbulb size={20} aria-hidden="true" />
          </button>
          <button type="button" className="pad-key" onClick={act('restart')} aria-label="重开本关">
            <RotateCcw size={20} aria-hidden="true" />
          </button>
        </div>

        {/* 十字键正中写着当前推的是哪一行哪一列，四个键推的就是它。 */}
        <div className="dpad" aria-label={`推移${lineLabel(anchor)}`}>
          <button type="button" className="dpad-key dpad-up" onClick={act('up')} aria-label={`第 ${anchor.col + 1} 列上移`}>
            <ArrowUp size={20} aria-hidden="true" />
          </button>
          <button type="button" className="dpad-key dpad-left" onClick={act('left')} aria-label={`第 ${anchor.row + 1} 行左移`}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span className="dpad-core">
            <i>行 {anchor.row + 1}</i>
            <i>列 {anchor.col + 1}</i>
          </span>
          <button type="button" className="dpad-key dpad-right" onClick={act('right')} aria-label={`第 ${anchor.row + 1} 行右移`}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className="dpad-key dpad-down" onClick={act('down')} aria-label={`第 ${anchor.col + 1} 列下移`}>
            <ArrowDown size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      {guide && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>怎么玩</h1>
            <p className="panel-status">迷宫是拼起来的，你只能整条推</p>
            <ol className="panel-steps">
              {TUTORIAL_STEPS.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  {step.detail}
                </li>
              ))}
            </ol>
            <button type="button" className="panel-action" onClick={closeGuide}>
              <Play size={18} aria-hidden="true" />
              开始穿越
            </button>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel panel-win">
            <h1>穿越成功</h1>
            <p className="panel-status">{levelLabel(view.levelIndex)}</p>
            {record && <p className="panel-badge">{recordLabel(record)}</p>}
            {/* 三颗星逐颗弹出来，一次性全亮就没有「攒到了」的感觉。 */}
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
            <p className="panel-score">{view.shifts} 步</p>
            <p className="panel-detail">{winComment(view.shifts, view.level.par)}</p>
            <p className="panel-detail">{rewardLabel(view.stars)} · 总星 {progressLabel(totalStars)}</p>

            <button
              type="button"
              className="panel-action"
              onClick={() => (hasNext
                ? apply(nextLevel(gameRef.current))
                : load(0, randomSeed()))}
            >
              {hasNext ? '下一关' : '换一张重头再来'}
            </button>
            <button type="button" className="panel-link" onClick={() => load(view.levelIndex, randomSeed())}>
              这一关换张新图
            </button>
          </div>
        </div>
      )}


    </div>
  );
}




