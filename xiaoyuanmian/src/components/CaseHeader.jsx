import { Clock3, RotateCcw, Search, Sparkles, Volume2, VolumeX } from 'lucide-react';

export default function CaseHeader({ state, aiConfigured, muted, onToggleMute, onRestart }) {
  return <header className="case-header">
    <div className="case-brand"><div className="case-mark"><Search size={20}/></div><div><strong>回声画廊</strong><span>校园谜案调查局</span></div></div>
    <div className="case-heading"><span>{state.case.subtitle}</span><h1>{state.case.title}</h1></div>
    <div className="case-status">
      <div><Clock3 size={15}/><span>{state.case.startTime}</span></div>
      <div className={aiConfigured ? 'provider online' : 'provider'}><Sparkles size={14}/><span>{aiConfigured ? 'AI 证词分析' : '剧本对白'}</span></div>
      <button type="button" onClick={onToggleMute} title={muted ? '开音效：查出新证据和白跑一趟是两种声音' : '静音'}>
        {muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}<span>{muted ? '音效' : '静音'}</span>
      </button>
      <button type="button" onClick={onRestart} title="重新开始案件"><RotateCcw size={17}/><span>重开</span></button>
    </div>
  </header>;
}
