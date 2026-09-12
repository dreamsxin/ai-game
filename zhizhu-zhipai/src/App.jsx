import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HelpCircle,
  Layers,
  Lightbulb,
  RotateCcw,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cardLabel, isRed, rankLabel, suitSymbol } from './game/cards.js';
import { FOUNDATION_COUNT, PILE_COUNT, levelRecipe } from './game/rules.js';
import { canDeal, isEmpty } from './game/moves.js';
import {
  autoMove,
  boardView,
  createGame,
  dealRow,
  dealsLeft,
  hint,
  moveTo,
  restart,
  restore,
  scoreOfState,
  select,
  serialize,
  starsOfState,
  undo,
} from './game/simulation.js';
import { createAudio, vibrate, vibrationFor } from './scene/audio.js';
import {
  LEVEL_OPTIONS,
  TUTORIAL_STEPS,
  bestLabel,
  dealsLabel,
  effectMessage,
  formatScore,
  hintLabel,
  levelLabel,
  movesLabel,
  recordLabel,
  rewardLabel,
  runsLabel,
  starLabel,
  statusLabel,
  undoLabel,
} from './scene/readout.js';

const BEST_KEY = 'zhizhu-zhipai:best';
const MUTE_KEY = 'zhizhu-zhipai:muted';
const TAUGHT_KEY = 'zhizhu-zhipai:taught';
const LEVEL_KEY = 'zhizhu-zhipai:level';
// 整局牌面存这里：一局蜘蛛纸牌要打十几分钟，切个后台就从头开始是不能接受的。
const SAVE_KEY = 'zhizhu-zhipai:save';

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000) + 1;
// 摞与摞之间的缝，px。牌宽和牌的横向位置都按它算，两处必须用同一个数。
const CARD_GAP = 4;

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

// 牌摞最多能有多长（发完 5 轮又一张都没搬走的极端情况），用来算叠放间距。
const stackGap = (boardHeight, cardHeight, longest) => {
  if (longest <= 1) return 0;
  const room = Math.max(0, boardHeight - cardHeight);
  // 下限 6px：再挤就看不出这是一叠牌了；上限 26px：牌少的时候别摊得太散。
  return Math.max(6, Math.min(26, room / (longest - 1)));
};

// 开局要么接上存档，要么开新局。存档读不出来（版本变了、被手改坏了）就当新局，
// 绝不能拿一份对不上的存档去渲染——那会白屏，比丢一局严重得多。
const openingGame = () => {
  const level = readJson(LEVEL_KEY, 0);
  return restore(readJson(SAVE_KEY, null)) ?? createGame(level, randomSeed());
};

export default function App() {
  const boardRef = useRef(null);
  const audioRef = useRef(null);
  const [game, setGame] = useState(openingGame);
  const [levelIndex, setLevelIndex] = useState(() => game.levelIndex);
  const [best, setBest] = useState(() => readJson(BEST_KEY, {}));
  const [muted, setMuted] = useState(() => readJson(MUTE_KEY, false));
  const [guide, setGuide] = useState(() => !readJson(TAUGHT_KEY, false));
  const [advice, setAdvice] = useState(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [record, setRecord] = useState(false);
  const mutedRef = useRef(muted);
  // 破纪录要拿开局那一刻的旧纪录比，而不是拿已经被本局刷过的比。
  const bestAtStartRef = useRef(readJson(BEST_KEY, {})[readJson(LEVEL_KEY, 0)] ?? 0);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudio({ muted: mutedRef.current });
    return audioRef.current;
  }, []);

  // 权威状态就是这个 state：回合制不需要每帧重渲染，一次动作一次 setState 正好。
  // 副作用（音效、震动）放在 setGame 外面：React 允许多次调用 updater，
  // 塞进 updater 里会把同一声音效重放好几遍。
  const apply = useCallback((next) => {
    if (next === game) return;
    setGame(next);
    setAdvice(null);
    ensureAudio().notify(next.effects);
    vibrate(vibrationFor(next.effects));
  }, [game, ensureAudio]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      writeJson(MUTE_KEY, next);
      if (audioRef.current) audioRef.current.setMuted(next);
      return next;
    });
  }, []);

  const load = useCallback((index, seed) => {
    bestAtStartRef.current = readJson(BEST_KEY, {})[index] ?? 0;
    setLevelIndex(index);
    writeJson(LEVEL_KEY, index);
    setGame(createGame(index, seed));
    setAdvice(null);
    setRecord(false);
    ensureAudio().play('deal');
  }, [ensureAudio]);

  useEffect(() => {
    const host = boardRef.current;
    if (!host) return undefined;
    const measure = () => setBox({ width: host.clientWidth, height: host.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, []);

  // 卸载时关掉 AudioContext：浏览器对同时存在的 context 有上限，热更新时不关会攒着。
  useEffect(() => () => audioRef.current?.dispose(), []);

  // 每一步都写存档。序列化是纯函数，只挑能还原牌局的那几样，历史只留最近 12 步。
  useEffect(() => {
    writeJson(SAVE_KEY, serialize(game));
  }, [game]);

  const score = scoreOfState(game);
  const stars = starsOfState(game);
  const finished = game.status === 'won';

  useEffect(() => {
    if (!finished) return;
    const previous = readJson(BEST_KEY, {})[levelIndex] ?? 0;
    if (score <= previous) return;
    setRecord(score > bestAtStartRef.current);
    const next = { ...readJson(BEST_KEY, {}), [levelIndex]: score };
    setBest(next);
    writeJson(BEST_KEY, next);
  }, [finished, score, levelIndex]);

  const view = useMemo(() => boardView(game), [game]);
  const longest = useMemo(
    () => Math.max(1, ...game.piles.map((pile) => pile.cards.length)),
    [game.piles],
  );
  const cardWidth = box.width > 0 ? (box.width - (PILE_COUNT - 1) * CARD_GAP) / PILE_COUNT : 0;
  const cardHeight = cardWidth * 1.42;
  const gap = stackGap(box.height, cardHeight, longest);
  const suits = levelRecipe(game.levelIndex).suits;
  const message = advice ?? effectMessage(game.effects, game);
  const dealNow = canDeal(game);

  const onPile = (index) => () => {
    ensureAudio();
    if (game.selection && game.selection.from !== index) {
      apply(moveTo(game, index));
      return;
    }
    apply(select(game, index));
  };

  const onCard = (pileIndex, cardIndex) => (event) => {
    event.stopPropagation();
    ensureAudio();
    const pile = game.piles[pileIndex];
    // 点背面牌等于点这一摞（可能是想放下手里的牌）。
    if (cardIndex < pile.down) {
      onPile(pileIndex)();
      return;
    }
    if (game.selection && game.selection.from !== pileIndex) {
      apply(moveTo(game, pileIndex));
      return;
    }
    apply(select(game, pileIndex, cardIndex));
  };

  const onCardDouble = (pileIndex, cardIndex) => (event) => {
    event.stopPropagation();
    ensureAudio();
    if (cardIndex < game.piles[pileIndex].down) return;
    apply(autoMove(game, pileIndex, cardIndex));
  };

  const askHint = () => {
    ensureAudio();
    const result = hint(game);
    setGame(result.state);
    setAdvice(hintLabel(result.move, dealNow));
  };

  return (
    <div className="app">
      <header className="hud-top">
        <div className="stat stat-score">
          <span className="stat-value">{formatScore(score)}</span>
          <span className="stat-label">{movesLabel(game.moves)} · {levelLabel(game.levelIndex)}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{runsLabel(game.runs)}</span>
          <span className="stat-label">{statusLabel(game.status)}</span>
        </div>
        <div className="stat stat-best">
          <Trophy size={13} aria-hidden="true" />
          <span className="stat-value">{formatScore(best[levelIndex] ?? 0)}</span>
        </div>
      </header>

      <div className="foundations" aria-label={`已收 ${game.runs} 门`}>
        {Array.from({ length: FOUNDATION_COUNT }, (unused, index) => {
          const card = game.foundations[index];
          return (
            <span key={index} className={`slot${card === undefined ? '' : ' slot-done'}`}>
              {card === undefined ? '' : suitSymbol(card, suits)}
            </span>
          );
        })}
      </div>

      <div ref={boardRef} className="board" style={{ '--card-w': `${cardWidth}px`, '--stack': `${gap}px` }}>
        {game.piles.map((pile, pileIndex) => (
          <div
            key={pileIndex}
            className={`pile${view.targets.has(pileIndex) ? ' pile-target' : ''}`}
            onClick={onPile(pileIndex)}
            role="button"
            tabIndex={0}
            aria-label={`第 ${pileIndex + 1} 摞，${pile.cards.length} 张`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPile(pileIndex)();
              }
            }}
          >
            {isEmpty(pile) && <span className="pile-empty" aria-hidden="true" />}
          </div>
        ))}

        {/*
          所有牌都画在同一层里，位置按「第几摞、第几张」算。
          这样一张牌换摞时 DOM 节点不变（key 是牌的 id），CSS 才能把它从旧位置
          滑到新位置；如果牌是各摞的子节点，跨摞移动就是删一个建一个，只能瞬移。
        */}
        <div className="cards" aria-hidden="false">
          {game.piles.flatMap((pile, pileIndex) =>
            pile.cards.map((card, cardIndex) => {
              const down = cardIndex < pile.down;
              const picked = game.selection
                && game.selection.from === pileIndex
                && cardIndex >= game.selection.index;
              return (
                <span
                  key={card}
                  className={`card${down ? ' card-down' : ''}${picked ? ' card-picked' : ''}${
                    !down && isRed(card, suits) ? ' card-red' : ''
                  }`}
                  style={{
                    left: `calc((var(--card-w) + ${CARD_GAP}px) * ${pileIndex})`,
                    top: `calc(${cardIndex} * var(--stack))`,
                    zIndex: pileIndex * 100 + cardIndex + 1,
                  }}
                  onClick={onCard(pileIndex, cardIndex)}
                  onDoubleClick={onCardDouble(pileIndex, cardIndex)}
                  aria-label={down ? '背面牌' : cardLabel(card, suits)}
                >
                  {down ? '' : (
                    <>
                      <i className="card-rank">{rankLabel(card)}</i>
                      <i className="card-suit">{suitSymbol(card, suits)}</i>
                    </>
                  )}
                </span>
              );
            }),
          )}
        </div>
      </div>

      {message && <p className="toast" role="status">{message}</p>}

      <footer className="tray">
        <button
          type="button"
          className="key"
          onClick={() => apply(undo(game))}
          disabled={game.history.length === 0}
          aria-label={undoLabel(game.history.length)}
        >
          <Undo2 size={18} aria-hidden="true" />
          {game.history.length > 0 && <b className="key-badge">{game.history.length}</b>}
        </button>
        <button type="button" className="key" onClick={askHint} aria-label="求提示">
          <Lightbulb size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`deal${dealNow ? '' : ' deal-off'}`}
          onClick={() => apply(dealRow(game))}
          aria-label={`发牌，${dealsLabel(dealsLeft(game))}`}
        >
          <Layers size={16} aria-hidden="true" />
          <span>{dealsLeft(game)}</span>
        </button>

        <button type="button" className="key" onClick={() => setGuide(true)} aria-label="玩法">
          <HelpCircle size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="key"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? '音效已关' : '音效已开'}
        >
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="key"
          onClick={() => load(levelIndex, randomSeed())}
          aria-label="换一局"
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </footer>

      {guide && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel">
            <h1>怎么玩</h1>
            <p className="panel-status">十摞牌，八门顺子，只能往大一点的牌上压</p>
            <ol className="panel-steps">
              {TUTORIAL_STEPS.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  {step.detail}
                </li>
              ))}
            </ol>
            <div className="panel-levels">
              {LEVEL_OPTIONS.map((option) => (
                <button
                  key={option.index}
                  type="button"
                  className={`level-key${option.index === levelIndex ? ' level-key-on' : ''}`}
                  onClick={() => load(option.index, randomSeed())}
                >
                  <b>{option.suits} 花色 · {option.name}</b>
                  <i>{option.detail}</i>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="panel-action"
              onClick={() => {
                setGuide(false);
                writeJson(TAUGHT_KEY, true);
                // 关引导是本局第一个用户手势，正好拿它把 AudioContext 解锁。
                ensureAudio().play('select');
              }}
            >
              开始摸牌
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel panel-win">
            <h1>八门收齐</h1>
            <p className="panel-status">{levelLabel(game.levelIndex)}</p>
            {record && <p className="panel-badge">{recordLabel(record)}</p>}
            <p className="panel-stars" aria-label={`获得 ${stars} 星`}>
              {starLabel(stars).split('').map((mark, index) => (
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
            <p className="panel-score">{formatScore(score)}</p>
            <p className="panel-detail">{movesLabel(game.moves)} · {rewardLabel(stars)}</p>
            <p className="panel-detail">{bestLabel(best[levelIndex] ?? 0)}</p>
            <button type="button" className="panel-action" onClick={() => load(levelIndex, randomSeed())}>
              再来一局
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

