import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';

export default function EndingDialog({ state, onRestart }) {
  if (!state.result) return null;
  const solved = state.result === 'solved';
  const culprit = solved ? state.characters.find(item => item.id === state.reveal?.culpritId) : null;
  return <div className="ending-backdrop">
    <section className="ending-dialog" role="dialog" aria-modal="true" aria-labelledby="ending-title">
      <div className={`ending-symbol ${solved ? 'solved' : 'failed'}`}>{solved ? <CheckCircle2 size={30}/> : <XCircle size={30}/>}</div>
      <span>{solved ? '案件解决' : '调查结束'}</span>
      <h2 id="ending-title">{solved ? '原作与真相都已找回' : '线索没能及时闭合'}</h2>
      <p>{solved ? state.reveal.summary : '校庆展览已经开始，现有证据还不足以形成可靠指控。案件真相不会在失败结局中直接揭示，你可以重新调查并找到完整证据链。'}</p>
      {solved && <div className="ending-facts"><div><small>调包者</small><strong>{culprit?.name}</strong></div><div><small>动机</small><strong>掩盖共同创作</strong></div><div><small>原作位置</small><strong>旧画材室画柜</strong></div></div>}
      <button type="button" onClick={onRestart}><RotateCcw size={17}/>重新调查</button>
    </section>
  </div>;
}
