import { MessageCircle, Send, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function DialoguePanel({ state, selectedId, busy, onSelect, onAsk, onConfront }) {
  const character = state.characters.find(item => item.id === selectedId) || state.characters[0];
  const [draft, setDraft] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const logRef = useRef(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [character.dialogue, busy]);
  useEffect(() => { setDraft(''); setEvidenceId(''); }, [character.id]);

  function submit(event) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    onAsk(character.id, question);
  }

  return <aside className="dialogue-panel" aria-labelledby="witness-title">
    <div className="witness-tabs" role="tablist" aria-label="案件人物">
      {state.characters.map(item => <button
        type="button" role="tab" aria-selected={item.id === character.id}
        key={item.id} onClick={() => onSelect(item.id)}
        className={item.id === character.id ? 'active' : ''}
      ><img src={item.image} alt=""/><span>{item.name}</span></button>)}
    </div>
    <div className="witness-head">
      <img src={character.image} alt={`${character.name}肖像`}/>
      <div><span id="witness-title">当前询问</span><h2>{character.name}</h2><p>{character.role}</p></div>
      <i style={{ background: character.color }} title="当前人物标记"></i>
    </div>
    <p className="witness-intro">{character.intro}</p>
    <div className="dialogue-log" ref={logRef} aria-live="polite">
      {!character.dialogue.length && <div className="dialogue-empty"><MessageCircle size={22}/><p>选择一个问题，或直接输入你想追问的内容。</p></div>}
      {character.dialogue.map(item => <div className="dialogue-entry" key={item.id}>
        <div className="player-line"><span>你</span><p>{item.question}</p></div>
        <div className="witness-line"><span>{character.name}</span><p>{item.text}</p><small>{item.provider === 'deepseek' ? 'AI 证词分析' : '案件记录'}</small></div>
      </div>)}
      {busy && <div className="typing" aria-label="正在整理证词"><i></i><i></i><i></i></div>}
    </div>
    <div className="quick-questions">
      {character.quickQuestions.map(question => <button type="button" key={question} disabled={busy} onClick={() => onAsk(character.id, question)}>{question}</button>)}
    </div>
    <form className="dialogue-form" onSubmit={submit}>
      <textarea value={draft} maxLength={240} rows="2" onChange={event => setDraft(event.target.value)} placeholder="追问时间、动机或证词矛盾" aria-label={`向${character.name}提问`}/>
      <button type="submit" disabled={busy || !draft.trim()} title="发送问题" aria-label="发送问题"><Send size={17}/></button>
    </form>
    <div className="confront-row">
      <ShieldAlert size={16}/><select value={evidenceId} onChange={event => setEvidenceId(event.target.value)} aria-label="选择对质证据">
        <option value="">选择证据进行对质</option>
        {state.evidence.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
      <button type="button" disabled={busy || !evidenceId} onClick={() => onConfront(character.id, evidenceId)}>出示</button>
    </div>
  </aside>;
}
