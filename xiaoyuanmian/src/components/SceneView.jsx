import { BookOpen, Camera, ClipboardList, Frame, KeyRound, LockKeyhole, Printer, Search, Trash2 } from 'lucide-react';

const icons = {
  book: BookOpen, camera: Camera, clipboard: ClipboardList, frame: Frame, key: KeyRound,
  lock: LockKeyhole, printer: Printer, search: Search, trash: Trash2,
};

export default function SceneView({ state, busy, onVisit, onInspect }) {
  const location = state.locations.find(item => item.id === state.currentLocationId);
  return <section className="scene-column" aria-labelledby="scene-title">
    <nav className="location-tabs" aria-label="调查地点">
      {state.locations.map(item => <button
        type="button" key={item.id} disabled={!item.unlocked || busy}
        className={item.id === state.currentLocationId ? 'active' : ''}
        onClick={() => onVisit(item.id)} title={!item.unlocked ? '继续调查以解锁' : item.description}
      ><span>{item.shortName}</span>{item.visited && <i aria-label="已到访"></i>}</button>)}
    </nav>
    <div className="scene-frame">
      <img src={location.image} alt={`${location.name}调查现场`} />
      <div className="scene-wash"></div>
      {location.hotspots.map(hotspot => {
        const Icon = icons[hotspot.icon] || Search;
        return <button
          type="button" key={hotspot.id}
          className={`hotspot ${hotspot.inspected ? 'inspected' : ''} ${!hotspot.available ? 'locked' : ''}`}
          style={{ left: `${hotspot.x + hotspot.width / 2}%`, top: `${hotspot.y + hotspot.height / 2}%` }}
          disabled={!hotspot.available || busy}
          onClick={() => onInspect(hotspot.id)}
          aria-label={`${hotspot.inspected ? '重新检查' : '检查'}${hotspot.label}`}
        ><span><Icon size={16}/>{hotspot.inspected ? '已记录' : hotspot.available ? '检查' : '待解锁'}</span></button>;
      })}
      <div className="scene-caption"><span>当前现场</span><h2 id="scene-title">{location.name}</h2><p>{location.description}</p></div>
    </div>
    <div className="objective-strip">
      <div><span>当前目标</span><strong>{state.objective}</strong></div>
      <div className="case-progress" aria-label={`已发现 ${state.progress.found} 条，共 ${state.progress.total} 条证据`}>
        <span>{state.progress.found}/{state.progress.total}</span><i><b style={{ width: `${state.progress.found / state.progress.total * 100}%` }}></b></i>
      </div>
    </div>
  </section>;
}
