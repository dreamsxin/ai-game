import { Check, LockKeyhole, Scale } from 'lucide-react';
import { useState } from 'react';

export default function AccusationPanel({ state, busy, onSubmit }) {
  const [suspectId, setSuspectId] = useState('');
  const [motiveId, setMotiveId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [evidenceIds, setEvidenceIds] = useState([]);
  const ready = suspectId && motiveId && locationId && evidenceIds.length >= 3 && !busy;

  function toggleEvidence(id) {
    setEvidenceIds(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
  }

  return <div className="accusation-panel">
    <div className="reasoning-intro"><Scale size={24}/><div><span>最终推理</span><h2>还原调包的完整链条</h2><p>选择调包者、动机、原作位置，并提交至少三项关键证据。</p></div></div>
    <div className="reasoning-grid">
      <label><span>调包者</span><select value={suspectId} onChange={event => setSuspectId(event.target.value)}><option value="">选择人物</option>{state.accusationOptions.suspects.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
      <label><span>动机</span><select value={motiveId} onChange={event => setMotiveId(event.target.value)}><option value="">选择动机</option>{state.accusationOptions.motives.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label><span>原作位置</span><select value={locationId} onChange={event => setLocationId(event.target.value)}><option value="">选择位置</option>{state.accusationOptions.locations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <div className="evidence-checks"><span>关键证据 <b>{evidenceIds.length}/3+</b></span><div>
      {state.evidence.map(item => <button type="button" key={item.id} className={evidenceIds.includes(item.id) ? 'selected' : ''} onClick={() => toggleEvidence(item.id)}>
        {evidenceIds.includes(item.id) ? <Check size={15}/> : <i></i>}<span>{item.name}</span>
      </button>)}
    </div></div>
    {!state.evidence.some(item => item.id === 'original-painting') && <p className="reasoning-lock"><LockKeyhole size={15}/>找到原作后，指控才可能形成完整闭环。</p>}
    <button className="submit-accusation" type="button" disabled={!ready} onClick={() => onSubmit({ suspectId, motiveId, locationId, evidenceIds })}>提交正式指控 · 剩余 {state.accusationsRemaining} 次</button>
  </div>;
}
