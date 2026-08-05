import { Clock3, FileSearch, Scale, X } from 'lucide-react';

const tabs = [
  { id: 'evidence', label: '证据', icon: FileSearch },
  { id: 'timeline', label: '时间线', icon: Clock3 },
  { id: 'reasoning', label: '推理', icon: Scale },
];

export default function CaseDrawer({ state, open, tab, selectedEvidenceId, onOpen, onClose, onTab, onEvidence, children }) {
  const selectedEvidence = state.evidence.find(item => item.id === selectedEvidenceId) || state.evidence.at(-1);
  return <>
    <nav className="case-tools" aria-label="案件档案">
      {tabs.map(item => {
        const Icon = item.icon;
        return <button type="button" key={item.id} onClick={() => onOpen(item.id)} className={open && tab === item.id ? 'active' : ''}>
          <Icon size={18}/><span>{item.label}</span>{item.id === 'evidence' && <b>{state.evidence.length}</b>}
        </button>;
      })}
    </nav>
    {open && <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="case-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div role="tablist" aria-label="档案视图">
            {tabs.map(item => <button type="button" role="tab" aria-selected={tab === item.id} key={item.id} onClick={() => onTab(item.id)}>{item.label}</button>)}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭档案"><X size={19}/></button>
        </div>
        <div className="drawer-body">
          {tab === 'evidence' && <div className="evidence-layout">
            <div className="evidence-list" role="list">
              {!state.evidence.length && <p className="empty-copy">还没有记录任何证据。先检查场景中的可疑位置。</p>}
              {state.evidence.map(item => <button type="button" role="listitem" key={item.id} onClick={() => onEvidence(item.id)} className={selectedEvidence?.id === item.id ? 'active' : ''}>
                <img src={item.image} alt=""/><div><span>{item.category} · {item.source}</span><strong>{item.name}</strong><p>{item.summary}</p></div>
              </button>)}
            </div>
            {selectedEvidence && <article className="evidence-detail">
              <img src={selectedEvidence.image} alt={`${selectedEvidence.name}证据特写`}/>
              <span>{selectedEvidence.category} · 来源：{selectedEvidence.source}</span>
              <h2 id="drawer-title">{selectedEvidence.name}</h2><p>{selectedEvidence.summary}</p>
            </article>}
          </div>}
          {tab === 'timeline' && <div className="timeline-view">
            <div className="timeline-rule"></div>
            {!state.timeline.length && <p className="empty-copy">调查到的时间节点会在这里形成完整顺序。</p>}
            {state.timeline.map(item => <article key={item.id}><time>{item.time}</time><i></i><div><h2>{item.title}</h2><p>{item.detail}</p></div></article>)}
          </div>}
          {tab === 'reasoning' && <div className="reasoning-view" id="drawer-title">{children}</div>}
        </div>
      </section>
    </div>}
  </>;
}
