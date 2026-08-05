import { AlertTriangle, LoaderCircle, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { askCharacter, CaseApiError, confrontCharacter, getCase, performAction, startCase, submitAccusation } from './caseApi.js';
import AccusationPanel from './components/AccusationPanel.jsx';
import CaseDrawer from './components/CaseDrawer.jsx';
import CaseHeader from './components/CaseHeader.jsx';
import DialoguePanel from './components/DialoguePanel.jsx';
import EndingDialog from './components/EndingDialog.jsx';
import SceneView from './components/SceneView.jsx';

const STORAGE_KEY = 'echo-gallery-game-id';

export default function App() {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState('lin-xia');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('evidence');
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const requestRef = useRef(null);
  const noticeTimer = useRef(null);

  const applyResult = useCallback(result => {
    setGame(result);
    localStorage.setItem(STORAGE_KEY, result.gameId);
    if (result.event?.message) {
      setNotice(result.event.message);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(''), 4200);
    }
  }, []);

  const loadOrStart = useCallback(async signal => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      try { return await getCase(savedId, { signal }); }
      catch (error) {
        if (signal.aborted) throw error;
        if (!(error instanceof CaseApiError) || error.code !== 'session_not_found') throw error;
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    return startCase({ signal });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    loadOrStart(controller.signal)
      .then(result => { if (!controller.signal.aborted) applyResult(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    fetch('/api/health', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setAiConfigured(Boolean(data?.aiConfigured)); })
      .catch(() => {});
    return () => { controller.abort(); clearTimeout(noticeTimer.current); };
  }, [applyResult, loadOrStart]);

  useEffect(() => {
    if (!drawerOpen) return;
    const close = event => { if (event.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [drawerOpen]);

  async function refresh() {
    if (!game?.gameId) return;
    const result = await getCase(game.gameId);
    applyResult(result);
  }

  async function run(label, operation) {
    if (!game || busy) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(label); setError('');
    try {
      const result = await operation(controller.signal);
      if (!controller.signal.aborted) applyResult(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause.code === 'version_conflict') {
        try { await refresh(); setError('现场记录已更新，请重新执行刚才的操作。'); }
        catch { setError('无法刷新案件状态。'); }
      } else {
        setError(cause.message || '操作未完成。');
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }

  function handleAction(action) {
    run('action', signal => performAction(game.gameId, game.state.version, action, { signal }));
  }

  function handleAsk(characterId, question) {
    run('dialogue', signal => askCharacter(game.gameId, game.state.version, characterId, question, { signal }));
  }

  function handleConfront(targetId, evidenceId) {
    run('confront', signal => confrontCharacter(game.gameId, game.state.version, targetId, evidenceId, { signal }));
  }

  function handleAccuse(accusation) {
    run('accuse', signal => submitAccusation(game.gameId, game.state.version, accusation, { signal }));
  }

  async function restart() {
    requestRef.current?.abort();
    setBusy('restart'); setError('');
    localStorage.removeItem(STORAGE_KEY);
    try {
      const result = await startCase();
      applyResult(result);
      setDrawerOpen(false); setSelectedCharacterId('lin-xia'); setSelectedEvidenceId('');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(''); }
  }

  function openDrawer(tab) {
    setDrawerTab(tab); setDrawerOpen(true);
    if (tab === 'evidence' && !selectedEvidenceId && game?.state.evidence.length) {
      setSelectedEvidenceId(game.state.evidence.at(-1).id);
    }
  }

  if (loading) return <div className="boot-screen"><LoaderCircle className="spin" size={30}/><strong>正在封锁现场</strong><span>整理展厅与人物记录…</span></div>;
  if (!game) return <div className="boot-screen error-screen"><AlertTriangle size={32}/><strong>无法进入调查</strong><span>{error}</span><button type="button" onClick={() => location.reload()}>重新连接</button></div>;

  const state = game.state;
  return <div className="app-shell">
    <CaseHeader state={state} aiConfigured={aiConfigured} onRestart={restart}/>
    <main className="investigation-main">
      <div className="case-kicker"><Search size={14}/><span>CASE 04-17</span><i></i><p>{state.case.opening}</p></div>
      <div className="investigation-grid">
        <SceneView
          state={state} busy={Boolean(busy)}
          onVisit={locationId => handleAction({ type: 'visit', locationId })}
          onInspect={hotspotId => handleAction({ type: 'inspect', hotspotId })}
        />
        <DialoguePanel
          state={state} selectedId={selectedCharacterId} busy={busy === 'dialogue'}
          onSelect={setSelectedCharacterId} onAsk={handleAsk} onConfront={handleConfront}
        />
      </div>
    </main>
    <CaseDrawer
      state={state} open={drawerOpen} tab={drawerTab} selectedEvidenceId={selectedEvidenceId}
      onOpen={openDrawer} onClose={() => setDrawerOpen(false)} onTab={setDrawerTab} onEvidence={setSelectedEvidenceId}
    >
      <AccusationPanel state={state} busy={Boolean(busy)} onSubmit={handleAccuse}/>
    </CaseDrawer>
    {notice && <div className="notice-toast" role="status">{notice}</div>}
    {error && <div className="error-toast" role="alert"><AlertTriangle size={16}/><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="关闭错误">×</button></div>}
    <EndingDialog state={state} onRestart={restart}/>
  </div>;
}
