// 榜单面板：只负责显示，不碰判定也不碰网络。
// 在线 / 本机两种状态由 App 传进来，这里连「为什么离线」都不解释——
// 玩家只该看到「榜单还在，成绩还在」，不该看到一串云错误码。

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { boardEmpty, boardHint, boardPending, boardRank, boardRow, boardTitle } from './scene/readout.js';
import { boardKey, cleanNickname, MAX_NICKNAME } from './game/leaderboard.js';

export default function BoardPanel({
  entries = [],
  online = false,
  loading = false,
  nickname = '',
  onNickname,
  rank = 0,
  clientId = '',
  limit = 8,
  showNick = false,
}) {
  const [draft, setDraft] = useState(nickname);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(nickname);
  }, [nickname]);

  const commit = () => {
    const next = cleanNickname(draft);
    setDraft(next);
    setEditing(false);
    if (onNickname && next !== nickname) onNickname(next);
  };

  const shown = entries.slice(0, limit);

  return (
    <section className="board" aria-label={boardTitle(online)}>
      <div className="board-head">
        <span className="board-title">
          <Trophy size={13} aria-hidden="true" /> {boardTitle(online)}
        </span>
        <span className="board-hint">{boardHint(online, loading)}</span>
      </div>

      {rank > 0 && <p className="board-rank">{boardRank(rank)}</p>}

      {showNick && (
        <div className="board-nick">
          <span className="board-nick-label">我的呼号</span>
          {editing ? (
            <input
              className="board-nick-input"
              value={draft}
              maxLength={MAX_NICKNAME}
              autoFocus
              aria-label="我的呼号"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit();
                if (event.key === 'Escape') { setDraft(nickname); setEditing(false); }
              }}
            />
          ) : (
            <button type="button" className="board-nick-button" onClick={() => setEditing(true)}>
              {nickname || '无名飞行员'} <span aria-hidden="true">✎</span>
            </button>
          )}
          <span className="board-nick-tip">下次成绩生效</span>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="board-empty">{boardEmpty()}</p>
      ) : (
        <ol className="board-list">
          {shown.map((entry, index) => {
            const line = boardRow(entry, index);
            const mine = entry.clientId === clientId;
            return (
              <li
                key={entry.id ?? boardKey(entry)}
                className={`board-row${mine ? ' board-row-mine' : ''}`}
              >
                <span className="board-main">{line.main}</span>
                <span className="board-sub">
                  {line.sub}
                  {entry.pending && <em className="board-pending"> · {boardPending()}</em>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
