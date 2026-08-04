import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronRight, CircleHelp, Flag, RotateCcw, Send, Sparkles, Swords, Trophy } from 'lucide-react';
import { AI, EMPTY, HUMAN, LEVELS, SIZE, checkWin, createBoard } from './game';
import { requestAiMove, requestChatMessage } from './aiService';

const labels = 'ABCDEFGHJKLMNOP'.split('');
const initialProfile = { score: 70, wins: 3, losses: 1, streak: 2 };
const initialMessages = [{ id: 'opening', role: 'assistant', content: '执黑先行。放松下，我会认真回应你的每一步。' }];

function readProfile() {
  try { return { ...initialProfile, ...JSON.parse(localStorage.getItem('gomoku-profile')) }; }
  catch { return initialProfile; }
}

export default function App() {
  const [board, setBoard] = useState(createBoard);
  const [profile, setProfile] = useState(readProfile);
  const [turn, setTurn] = useState(HUMAN);
  const [status, setStatus] = useState('playing');
  const [lastMove, setLastMove] = useState(null);
  const [history, setHistory] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [aiSource, setAiSource] = useState('LOCAL');
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [chatStatus, setChatStatus] = useState('idle');
  const [chatError, setChatError] = useState('');
  const gameId = useRef(0);
  const messageId = useRef(0);
  const aiRequest = useRef(null);
  const chatRequest = useRef(null);
  const chatList = useRef(null);

  const levelIndex = useMemo(() => {
    let result = 0;
    LEVELS.forEach((level, i) => { if (profile.score >= level.threshold) result = i; });
    return result;
  }, [profile.score]);
  const level = LEVELS[levelIndex];
  const next = LEVELS[levelIndex + 1];
  const progress = next ? ((profile.score - level.threshold) / (next.threshold - level.threshold)) * 100 : 100;

  useEffect(() => { localStorage.setItem('gomoku-profile', JSON.stringify(profile)); }, [profile]);

  useEffect(() => {
    return () => chatRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (chatList.current) chatList.current.scrollTop = chatList.current.scrollHeight;
  }, [messages, chatStatus]);

  useEffect(() => {
    fetch('/api/health')
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data?.aiConfigured) setAiSource('MCP · DEEPSEEK'); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (turn !== AI || status !== 'playing') return;
    const currentId = gameId.current;
    const copy = board.map(row => [...row]);
    const controller = new AbortController();
    let active = true;
    let delayTimer;
    let finishDelay;
    aiRequest.current?.abort();
    aiRequest.current = controller;
    setThinking(true);

    const minimumDelay = new Promise(resolve => {
      finishDelay = resolve;
      delayTimer = setTimeout(resolve, 300);
    });
    const moveRequest = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return requestAiMove(copy, level, { signal: controller.signal });
    });

    Promise.all([moveRequest, minimumDelay])
      .then(([move]) => {
        if (!active || controller.signal.aborted || currentId !== gameId.current || !move) return;
        copy[move.row][move.col] = AI;
        setBoard(copy); setLastMove({ ...move, player: AI });
        setHistory(h => [...h, { ...move, player: AI }]);
        setMessages(items => [...items, {
          id: `move-${currentId}-${messageId.current++}`,
          role: 'assistant',
          content: move.comment || '这一手先落下，看看你接下来怎么应对。',
        }]);
        if (checkWin(copy, move.row, move.col, AI)) finish('lost');
        else if (copy.every(row => row.every(Boolean))) finish('draw');
        else setTurn(HUMAN);
      })
      .catch(error => {
        if (!controller.signal.aborted) console.error('AI turn failed:', error);
      })
      .finally(() => {
        if (active && currentId === gameId.current) setThinking(false);
      });

    return () => {
      active = false;
      clearTimeout(delayTimer);
      finishDelay?.();
      controller.abort();
      if (aiRequest.current === controller) aiRequest.current = null;
    };
  }, [turn, status, board, level]);

  function finish(result) {
    setStatus(result);
    setProfile(p => {
      if (result === 'won') return { ...p, score: p.score + level.win, wins: p.wins + 1, streak: p.streak + 1 };
      if (result === 'lost') return { ...p, score: Math.max(0, p.score - 10), losses: p.losses + 1, streak: 0 };
      return { ...p, score: p.score + 10 };
    });
  }

  function place(row, col) {
    if (turn !== HUMAN || status !== 'playing' || board[row][col] !== EMPTY || thinking) return;
    const copy = board.map(line => [...line]);
    copy[row][col] = HUMAN;
    setBoard(copy); setLastMove({ row, col, player: HUMAN });
    setHistory(h => [...h, { row, col, player: HUMAN }]);
    if (checkWin(copy, row, col, HUMAN)) finish('won');
    else if (copy.every(line => line.every(Boolean))) finish('draw');
    else setTurn(AI);
  }

  function restart() {
    aiRequest.current?.abort();
    chatRequest.current?.abort();
    aiRequest.current = null;
    chatRequest.current = null;
    gameId.current++; setBoard(createBoard()); setTurn(HUMAN); setStatus('playing');
    setLastMove(null); setHistory([]); setThinking(false);
    setMessages(initialMessages); setDraft(''); setChatStatus('idle'); setChatError('');
  }

  function undo() {
    if (status !== 'playing' || thinking || history.length < 2 || turn !== HUMAN) return;
    const removed = history.slice(-2); const copy = board.map(row => [...row]);
    removed.forEach(m => { copy[m.row][m.col] = EMPTY; });
    const nextHistory = history.slice(0, -2);
    setBoard(copy); setHistory(nextHistory); setLastMove(nextHistory.at(-1) || null);
  }

  async function sendChat(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || chatStatus === 'sending') return;
    const currentId = gameId.current;
    const controller = new AbortController();
    const conversation = messages.slice(-10).map(item => ({ role: item.role, content: item.content }));
    chatRequest.current?.abort();
    chatRequest.current = controller;
    setMessages(items => [...items, { id: `user-${messageId.current++}`, role: 'user', content }]);
    setDraft(''); setChatError(''); setChatStatus('sending');

    try {
      const result = await requestChatMessage({
        message: content,
        history: conversation,
        board,
        lastMove,
        difficulty: level.id,
        reasoningDepth: level.depth,
      }, { signal: controller.signal });
      if (controller.signal.aborted || currentId !== gameId.current) return;
      setMessages(items => [...items, { id: `chat-${messageId.current++}`, role: 'assistant', content: result.message }]);
    } catch (error) {
      if (!controller.signal.aborted && currentId === gameId.current) setChatError('这句话没能送达，再试一次。');
    } finally {
      if (chatRequest.current === controller) chatRequest.current = null;
      if (!controller.signal.aborted && currentId === gameId.current) setChatStatus('idle');
    }
  }

  function handleChatKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const statusText = status === 'won' ? '你赢了' : status === 'lost' ? 'AI 获胜' : status === 'draw' ? '平局' : thinking ? 'AI 正在推演' : '轮到你落子';

  return <div className="app-shell">
    <header>
      <div className="brand"><div className="brand-mark">棋</div><div><strong>棋境</strong><span>AI 对弈场</span></div></div>
      <nav><button className="active">对弈</button><button disabled>棋谱</button><button disabled>排行榜</button></nav>
      <div className="player-mini"><span>弈者 07</span><b>{profile.score}</b><Trophy size={16}/></div>
    </header>

    <main>
      <section className="title-row">
        <div><span className="eyebrow">五子棋 · 竞技模式</span><h1>与 AI 过招</h1><p>执黑先行，连成五子即可取胜。</p></div>
        <div className="turn-indicator"><span className={turn === HUMAN && status === 'playing' ? 'pulse' : ''}></span><div><small>当前回合</small><strong>{statusText}</strong></div></div>
      </section>

      <section className="game-layout">
        <div className="board-panel">
          <div className="opponents">
            <div className="opponent human"><div className="avatar">弈</div><div><span>弈者 07</span><strong>你 · 黑子</strong></div></div>
            <div className="versus"><span></span>VS<span></span></div>
            <div className="opponent ai"><div><span>{aiSource}</span><strong>{level.subtitle} · 白子</strong></div><div className="avatar"><Bot size={21}/></div></div>
          </div>

          <div className="board-wrap">
            <div className="coords coords-top">{labels.map(x => <span key={x}>{x}</span>)}</div>
            <div className="coords coords-left">{Array.from({length: SIZE}, (_,i) => <span key={i}>{i + 1}</span>)}</div>
            <div className="board" role="grid" aria-label="十五路五子棋棋盘">
              {board.map((row, r) => row.map((cell, c) => <button
                key={`${r}-${c}`} className={`cell ${cell ? 'occupied' : ''}`}
                onClick={() => place(r, c)} aria-label={`${labels[c]}${r + 1}${cell === HUMAN ? ' 黑子' : cell === AI ? ' 白子' : ''}`}
              >
                {cell !== EMPTY && <span className={`stone ${cell === HUMAN ? 'black' : 'white'} ${lastMove?.row === r && lastMove?.col === c ? 'last' : ''}`}></span>}
              </button>))}
              <i className="star s1"></i><i className="star s2"></i><i className="star s3"></i><i className="star s4"></i><i className="star s5"></i>
            </div>
          </div>

          <div className="board-actions">
            <button onClick={undo} disabled={history.length < 2 || thinking || turn !== HUMAN}><RotateCcw size={17}/>悔棋</button>
            <button onClick={restart}><Flag size={17}/>重新开始</button>
          </div>
        </div>

        <aside>
          <div className="rank-section">
            <div className="section-label"><span>当前难度</span><button title="难度由积分自动决定"><CircleHelp size={16}/></button></div>
            <div className="rank-head"><div className="rank-icon"><Sparkles size={21}/></div><div><h2>{level.name}</h2><p>{level.subtitle} · 推演 {level.depth} 层</p></div><span>Lv.{levelIndex + 1}</span></div>
            <div className="progress-label"><span>{profile.score} 积分</span><span>{next ? `距 ${next.name} ${next.threshold - profile.score} 分` : '已达最高级'}</span></div>
            <div className="progress"><i style={{width: `${Math.max(3, progress)}%`}}></i></div>
            <div className="level-track">{LEVELS.map((item, i) => <div className={i <= levelIndex ? 'reached' : ''} key={item.name}><i></i><span>{item.name}</span></div>)}</div>
          </div>

          <div className="score-section">
            <div className="section-label"><span>本赛季战绩</span><small>第 4 赛季</small></div>
            <div className="stats"><div><strong>{profile.wins + profile.losses}</strong><span>总对局</span></div><div><strong>{profile.wins}</strong><span>胜场</span></div><div><strong>{profile.streak}</strong><span>连胜</span></div></div>
            <div className="reward"><div><Swords size={17}/><span>击败本级 AI</span></div><strong>+{level.win} 分</strong></div>
          </div>

          <div className="chat-section">
            <div className="section-label"><span>对局交流</span><small>{chatStatus === 'sending' ? '对方正在输入' : '在线'}</small></div>
            <div className="chat-messages" ref={chatList} aria-live="polite">
              {messages.map(item => <div className={`chat-message ${item.role}`} key={item.id}>
                <span>{item.role === 'assistant' ? '对手' : '你'}</span>
                <p>{item.content}</p>
              </div>)}
              {chatStatus === 'sending' && <div className="chat-typing" aria-label="对方正在输入"><i></i><i></i><i></i></div>}
            </div>
            {chatError && <p className="chat-error" role="alert">{chatError}</p>}
            <form className="chat-form" onSubmit={sendChat}>
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value.slice(0, 240))}
                onKeyDown={handleChatKeyDown}
                placeholder="聊聊刚才这一步"
                aria-label="对局消息"
                rows="2"
              />
              <button type="submit" disabled={!draft.trim() || chatStatus === 'sending'} title="发送消息" aria-label="发送消息"><Send size={16}/></button>
            </form>
          </div>

          <div className="rules-section"><div className="section-label"><span>升阶规则</span></div><p>积分达到下一等级门槛后自动升阶，AI 会增加推演深度，攻防判断也将更精准。</p><button disabled>查看完整规则 <ChevronRight size={15}/></button></div>
        </aside>
      </section>
    </main>

    {status !== 'playing' && <div className="result-overlay" onClick={restart}><div className="result-modal" onClick={e => e.stopPropagation()}>
      <div className="result-symbol">{status === 'won' ? '胜' : status === 'lost' ? '负' : '和'}</div>
      <h2>{statusText}</h2><p>{status === 'won' ? `本局获得 ${level.win} 积分` : status === 'lost' ? '本局扣除 10 积分' : '本局获得 10 积分'}</p>
      <button onClick={restart}>再来一局</button>
    </div></div>}
  </div>;
}
