import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadPresigned } from '@vercel/blob/client';
import { serverRequest, getCsrfToken } from '../services/server.js';
import { phaseLabel, requestLabel } from '../i18n/index.js';
import { adminText as a } from '../i18n/admin.js';
import './AdminPanel.css';

const listFields = ['principles', 'key_actions', 'coaching_points', 'risk_notes'];
const maxVideoBytes = 256 * 1024 * 1024;
const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
const emptyScenario = () => ({
  phase: 'build_up', own: '4-3-3', opp: '4-2-3-1', variant: 'A', title: '', objective: '',
  principles: '', key_actions: '', coaching_points: '', risk_notes: '', video_id: '',
  profile: { risk: a('defaultRisk'), verticality: a('defaultVerticality'), tempo: a('defaultTempo') },
});
const editScenario = (scenario) => ({ ...scenario, video_id: scenario.video_id || '',
  ...Object.fromEntries(listFields.map((field) => [field, scenario[field].join('\n')])) });

function ScenarioEditor({ scenario, initialVideoId = '', content, busy, onSave, onClose }) {
  const [draft, setDraft] = useState(() => scenario ? editScenario(scenario) : { ...emptyScenario(), video_id: initialVideoId });
  const change = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
  const save = (event) => {
    event.preventDefault();
    const next = Object.fromEntries(['phase', 'own', 'opp', 'variant', 'title', 'objective', 'profile', 'video_id'].map((key) => [key, draft[key]]));
    next.video_id = next.video_id || null;
    if (scenario) next.scenario_id = scenario.scenario_id;
    for (const field of listFields) next[field] = draft[field].split('\n').map((line) => line.trim()).filter(Boolean);
    void onSave(next, event.nativeEvent.submitter?.value === 'publish');
  };
  const phases = content.phase_roadmap?.map((item) => item.id) || content.phases;
  return <section className="adminEditor" aria-labelledby="scenario-editor-title">
    <div className="sectionTitleRow">
      <div><span>◇</span><h2 id="scenario-editor-title">{a(scenario ? 'editScenario' : 'newScenario')}</h2></div>
      <button className="textButton" type="button" onClick={onClose} disabled={busy}>{a('closeEditor')}</button>
    </div>
    <p className="muted">{a('editorDescription')}</p>
    <p className="adminHint">{a('draftWarning')}</p>
    <form className="adminForm" onSubmit={save}>
      <fieldset disabled={busy}>
        <div className="adminFormGrid">
          <label>{a('phase')}<select aria-label={a('phase')} value={draft.phase} onChange={(event) => change('phase', event.target.value)}>{phases.map((phase) => <option key={phase} value={phase}>{phaseLabel(phase)}</option>)}</select></label>
          <label>{a('variant')}<select aria-label={a('variant')} value={draft.variant} onChange={(event) => change('variant', event.target.value)}>{content.variants.map((variant) => <option key={variant} value={variant}>{a(`variant${variant}`)}</option>)}</select></label>
          <label>{a('own')}<input list="admin-formations" value={draft.own} onChange={(event) => change('own', event.target.value)} pattern="[1-5](-[1-5]){1,4}" maxLength={15} required /></label>
          <label>{a('opp')}<input list="admin-formations" value={draft.opp} onChange={(event) => change('opp', event.target.value)} pattern="[1-5](-[1-5]){1,4}" maxLength={15} required /></label>
        </div>
        <datalist id="admin-formations">{content.formations.map((formation) => <option key={formation} value={formation} />)}</datalist>
        <p className="adminFieldHint">{a('formationHint')}</p>
        <p className="adminHint">{a('classificationHint')} <strong>{phaseLabel(draft.phase)} · {draft.own} / {draft.opp} · {a(`variant${draft.variant}`)}</strong></p>
        <label>{a('titleField')}<input value={draft.title} onChange={(event) => change('title', event.target.value)} maxLength={160} required /></label>
        <label>{a('objective')}<textarea value={draft.objective} onChange={(event) => change('objective', event.target.value)} maxLength={2000} rows={3} required /></label>
        <div className="adminFormGrid">
          {listFields.map((field) => <label key={field}>{a(field)}<textarea value={draft[field]} onChange={(event) => change(field, event.target.value)} maxLength={12000} rows={5} required /></label>)}
        </div>
        <div className="adminProfileGrid">
          {['risk', 'verticality', 'tempo'].map((field) => <label key={field}>{a(field)}<input value={draft.profile[field]} onChange={(event) => change('profile', { ...draft.profile, [field]: event.target.value })} maxLength={80} required /></label>)}
        </div>
        <label>{a('video')}<select aria-label={a('video')} value={draft.video_id} onChange={(event) => change('video_id', event.target.value)}>
          <option value="">{a('noVideo')}</option>
          {content.videos.filter((video) => video.verified && !video.deleting).map((video) => <option key={video.id} value={video.id}>{video.filename}</option>)}
        </select></label>
        <div className="adminActions">
          <button className="primaryButton" type="submit" value="publish" disabled={!draft.video_id} title={!draft.video_id ? a('videoRequired') : undefined}>{a(busy ? 'working' : 'saveAndPublish')}</button>
          <button className="secondaryButton" type="submit" value="draft">{a('saveDraft')}</button>
          <button className="textButton" type="button" onClick={onClose}>{a('cancel')}</button>
        </div>
      </fieldset>
    </form>
  </section>;
}

export default function AdminPanel({ onContentChanged, onOpenAnalysis }) {
  const [section, setSection] = useState('videos');
  const [content, setContent] = useState(null);
  const [insights, setInsights] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recentScenarioId, setRecentScenarioId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [validating, setValidating] = useState(false);
  const [videoSearch, setVideoSearch] = useState('');
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [previewVideo, setPreviewVideo] = useState(null);
  const [editor, setEditor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const fileInput = useRef(null);
  const editorRef = useRef(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await serverRequest('admin-content');
      if (mounted.current) setContent(next);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const openSection = async (next) => {
    setSection(next); setError(''); setNotice(''); setConfirm(null);
    try {
      if (next === 'statistics') setInsights(await serverRequest('insights'));
      if (next === 'events') setEvents((await serverRequest('admin-events')).events);
    } catch (err) { setError(err.message); }
  };

  const refresh = async () => {
    await load();
    await openSection(section);
    await onContentChanged();
  };

  const mutate = async (action, body, success) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await serverRequest(action, { revision: content.revision, ...body });
      if (!Number.isInteger(next.revision) || !Array.isArray(next.scenarios)) throw new Error(a('saveFailure'));
      const affected = next.scenarios.find((scenario) => scenario.scenario_id === (body.scenario_id || body.scenario?.scenario_id)) ||
        (action === 'admin-scenarios' ? next.scenarios.find((scenario) => !content.scenarios.some((previous) => previous.scenario_id === scenario.scenario_id)) : null);
      setRecentScenarioId(affected?.scenario_id || null);
      setContent(next); setNotice(a(success)); setConfirm(null); setEditor(null);
      await onContentChanged();
    } catch (err) {
      if (err.status === 409) await load();
      setError(err.message);
    } finally { setBusy(false); }
  };

  const upload = async (event) => {
    event.preventDefault();
    if (!file || !/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4') || file.size < 24 || file.size > maxVideoBytes) {
      setError(a('invalidFile')); return;
    }
    setBusy(true); setError(''); setNotice(''); setUploadProgress(0); setValidating(false);
    try {
      const intent = await serverRequest('admin-upload-intent', { filename: file.name, size: file.size, contentType: 'video/mp4' });
      await uploadPresigned(intent.pathname, file, {
        access: 'public', contentType: 'video/mp4', multipart: true,
        handleUploadUrl: '/api/admin-upload-token', clientPayload: JSON.stringify({ upload_id: intent.upload_id }),
        headers: { 'X-CSRF-Token': getCsrfToken() },
        onUploadProgress: ({ percentage }) => { if (mounted.current) setUploadProgress(Math.min(100, Math.round(percentage))); },
      });
      setValidating(true);
      const next = await serverRequest('admin-upload-complete', { upload_id: intent.upload_id });
      if (!Array.isArray(next.videos) || !Number.isInteger(next.revision)) throw new Error(a('saveFailure'));
      const uploaded = next.videos.find((video) => video.id === intent.upload_id && video.verified && !video.deleting);
      if (!uploaded) throw new Error(a('saveFailure'));
      setContent(next); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      selectEditor(null, uploaded.id, 'uploadSuccess');
    } catch (err) {
      // Blob transport errors may contain English or signed URLs. Keep them out of the interface.
      setError(err.status ? err.message : a('uploadError'));
    } finally { setBusy(false); setUploadProgress(null); setValidating(false); }
  };

  const selectEditor = (scenario, initialVideoId = '', noticeKey = '') => {
    setSection('scenarios'); setScenarioSearch(''); setStatusFilter('all'); setPreviewVideo(null);
    setRecentScenarioId(null);
    setEditor({ scenario, initialVideoId }); setNotice(noticeKey ? a(noticeKey) : ''); setError('');
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const videos = content?.videos.filter((video) => video.filename.toLocaleLowerCase('it-IT').includes(videoSearch.trim().toLocaleLowerCase('it-IT'))) || [];
  const scenarios = content?.scenarios.filter((scenario) => (statusFilter === 'all' || scenario.status === statusFilter) &&
    `${scenario.title} ${phaseLabel(scenario.phase)} ${scenario.own} ${scenario.opp} ${scenario.label}`.toLocaleLowerCase('it-IT').includes(scenarioSearch.trim().toLocaleLowerCase('it-IT'))) || [];
  const recentScenario = content?.scenarios.find((scenario) => scenario.scenario_id === recentScenarioId);

  return <section className="adminPanel">
    <header className="workspaceHeader">
      <div><div className="sectionEyebrow">{a('eyebrow')}</div><h1>{a('title')}</h1><p>{a('description')}</p></div>
      {content && <div className="catalogCounter"><strong>{content.scenarios.filter((scenario) => scenario.status === 'published').length}</strong><span>{a('publishedCount')}</span></div>}
    </header>
    <div className="adminNavigation" aria-label={a('title')}>
      <div className="adminTabs">{['videos', 'scenarios', 'statistics', 'events'].map((name) => <button className={section === name ? 'active' : ''} key={name} type="button" onClick={() => void openSection(name)} aria-pressed={section === name} disabled={busy}>{a(name)}</button>)}</div>
      <button className="secondaryButton" onClick={() => void refresh()} disabled={busy || loading}>{a('refresh')}</button>
    </div>
    {error && <div className="errorNotice" role="alert">{error}</div>}
    {notice && <div className="adminSuccess" role="status">{notice}
      {recentScenario && <>
        <p><strong>{recentScenario.title}</strong><br />{phaseLabel(recentScenario.phase)} · {recentScenario.own} / {recentScenario.opp} · {a(`variant${recentScenario.variant}`)}</p>
        <div className="adminActions">
          {recentScenario.status === 'draft' && <button type="button" className="primaryButton" disabled={busy || !recentScenario.video_id} onClick={() => void mutate('admin-scenario-status', { scenario_id: recentScenario.scenario_id, status: 'published' }, 'published')}>{a('publishNow')}</button>}
          {recentScenario.status === 'published' && <button type="button" className="primaryButton" disabled={busy} onClick={() => onOpenAnalysis(recentScenario)}>{a('openAnalysis')}</button>}
        </div>
      </>}
    </div>}
    {loading && !content && <p role="status" className="muted">{a('loading')}</p>}
    {!loading && !content && <button type="button" className="secondaryButton" onClick={load}>{a('retry')}</button>}

    {content && section === 'videos' && <>
      <section className="adminUploadCard">
        <div><span className="sectionEyebrow">MP4</span><h2>{a('uploadTitle')}</h2><p className="muted">{a('uploadDescription')}</p><small>{a('uploadLimits')}</small></div>
        <form onSubmit={upload} className="adminUploadForm">
          <label htmlFor="admin-video-file">{a('chooseFile')}</label>
          <input id="admin-video-file" ref={fileInput} type="file" accept="video/mp4,.mp4" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          {file && <span className="adminFieldHint">{file.name} · {formatBytes(file.size)}</span>}
          <button type="submit" className="primaryButton" disabled={busy || !file}>{a(validating ? 'validating' : uploadProgress !== null ? 'uploading' : 'uploadButton')}</button>
          {uploadProgress !== null && <div className="adminProgress" role="status"><progress value={uploadProgress} max={100} aria-label={a('uploading')} /><span>{validating ? a('validating') : `${uploadProgress}%`}</span></div>}
        </form>
      </section>
      <p className="adminHint">{a('originalPreserved')}</p>
      <div className="adminToolbar"><input value={videoSearch} onChange={(event) => setVideoSearch(event.target.value)} placeholder={a('mediaSearch')} aria-label={a('mediaSearch')} /></div>
      <div className="adminVideoGrid">{videos.map((video) => {
        const inUse = content.scenarios.some((scenario) => scenario.video_id === video.id);
        return <article className="adminVideoCard" key={video.id}>
          <div className="adminVideoIcon" aria-hidden="true">▷</div><div className="adminVideoInfo"><h3>{video.filename}</h3><p>{formatBytes(video.size)} · {a(video.original ? 'original' : 'verified')}</p></div>
          <div className="adminActions"><button className="secondaryButton" type="button" onClick={() => setPreviewVideo(previewVideo?.id === video.id ? null : video)}>{a(previewVideo?.id === video.id ? 'closePreview' : 'previewVideo')}</button>
            <button className="secondaryButton" type="button" disabled={busy || !video.verified || video.deleting} onClick={() => selectEditor(null, video.id)}>{a('classifyVideo')}</button>
            {!video.original && <button className="textButton dangerButton" type="button" disabled={busy || inUse} title={inUse ? a('videoInUse') : undefined} onClick={() => setConfirm({ kind: 'video', item: video })}>{a('deleteVideo')}</button>}
          </div>
          {previewVideo?.id === video.id && <video className="adminVideoPreview" src={video.url} controls playsInline preload="metadata" aria-label={video.filename} />}
        </article>;
      })}</div>
      {!videos.length && <p className="muted">{a('noVideos')}</p>}
    </>}

    {content && section === 'scenarios' && <>
      <div className="adminToolbar"><input value={scenarioSearch} onChange={(event) => setScenarioSearch(event.target.value)} placeholder={a('scenarioSearch')} aria-label={a('scenarioSearch')} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={a('allStatuses')}><option value="all">{a('allStatuses')}</option>{['published', 'draft', 'inactive'].map((status) => <option key={status} value={status}>{a(`status.${status}`)}</option>)}</select><button className="primaryButton" onClick={() => selectEditor(null)} disabled={busy}>{a('newScenario')}</button></div>
      <div ref={editorRef} className="adminEditorAnchor">{editor && <ScenarioEditor key={editor.scenario?.scenario_id || `new-${editor.initialVideoId}`} scenario={editor.scenario} initialVideoId={editor.initialVideoId} content={content} busy={busy} onClose={() => setEditor(null)} onSave={(scenario, publish) => mutate('admin-scenarios', { scenario, publish }, publish ? 'published' : 'draftSaved')} />}</div>
      <div className="adminScenarioList">{scenarios.map((scenario) => <article className="adminScenarioCard" key={scenario.scenario_id}>
        <div className="adminScenarioMeta"><span className={`adminStatus ${scenario.status}`}>{a(`status.${scenario.status}`)}</span>{scenario.original && <span className="muted">{a('originalScenario')}</span>}<span>{phaseLabel(scenario.phase)} · {scenario.own} / {scenario.opp} · {a(`variant${scenario.variant}`)}</span></div>
        <h3>{scenario.title}</h3><p>{scenario.objective}</p>
        <div className="adminActions"><button type="button" className="secondaryButton" disabled={busy} onClick={() => selectEditor(scenario)}>{a('edit')}</button>
          {scenario.status !== 'published' && <button type="button" className="primaryButton" disabled={busy || !scenario.video_id} title={!scenario.video_id ? a('videoRequired') : undefined} onClick={() => void mutate('admin-scenario-status', { scenario_id: scenario.scenario_id, status: 'published' }, 'published')}>{a('publish')}</button>}
          {scenario.status === 'published' && <button type="button" className="textButton" disabled={busy} onClick={() => void mutate('admin-scenario-status', { scenario_id: scenario.scenario_id, status: 'inactive' }, 'deactivated')}>{a('deactivate')}</button>}
          {!scenario.original && <button type="button" className="textButton dangerButton" disabled={busy} onClick={() => setConfirm({ kind: 'scenario', item: scenario })}>{a('deleteScenario')}</button>}
        </div>
      </article>)}</div>
      {!scenarios.length && <p className="muted">{a('noScenarios')}</p>}
    </>}

    {content && section === 'statistics' && <>
      {!insights && !error && <p role="status" className="muted">{a('loading')}</p>}
      {insights && <><div className="adminStats">
        {[[a('videoCount'), content.videos.length], [a('draftCount'), content.scenarios.filter((scenario) => scenario.status === 'draft').length], [a('inactiveCount'), content.scenarios.filter((scenario) => scenario.status === 'inactive').length], [a('feedbackCount'), insights.feedback_count], [a('positiveFeedback'), insights.positive_feedback], [a('requestCount'), insights.scenario_requests]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </div><h2>{a('mostRequested')}</h2>{insights.top_requested_scenarios.length ? <ul className="adminRanking">{insights.top_requested_scenarios.map(([key, count]) => <li key={key}><span>{requestLabel(key)}</span><strong>{count}</strong></li>)}</ul> : <p className="muted">{a('noRequests')}</p>}</>}
    </>}

    {content && section === 'events' && <>
      <p className="adminHint">{a('privateEvents')}</p>
      {!events && !error && <p role="status" className="muted">{a('loading')}</p>}
      {events?.length === 0 && <p className="muted">{a('noEvents')}</p>}
      <div className="adminEventList">{events?.map((event) => <article className="adminEvent" key={event.id}>
        <div className="adminEventTop"><span className="sectionEyebrow">{a(event.type === 'feedback' ? 'feedback' : 'request')}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('it-IT')}</time></div>
        <h3>{event.type === 'feedback' ? content.scenarios.find((scenario) => scenario.scenario_id === event.scenario_id)?.title || a('unavailableScenario') : requestLabel(`${event.phase}|${event.own}|${event.opp}`)}</h3>
        {event.type === 'feedback' && <span className={`adminRating ${event.useful ? 'positive' : ''}`}>{a(event.useful ? 'useful' : 'notUseful')}</span>}
        <p>{event.note || a('noNote')}</p>
      </article>)}</div>
    </>}

    {confirm && <div className="adminDialogBackdrop" onClick={() => { if (!busy) setConfirm(null); }}><section className="adminConfirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="admin-confirm-title">{a(confirm.kind === 'video' ? 'deleteVideo' : 'deleteScenario')}</h2><p>{a(confirm.kind === 'video' ? 'deleteVideoQuestion' : 'deleteScenarioQuestion')}</p><strong>{confirm.item.filename || confirm.item.title}</strong>
      <div className="adminActions"><button className="secondaryButton" type="button" disabled={busy} onClick={() => setConfirm(null)} autoFocus>{a('cancel')}</button><button className="primaryButton dangerAction" type="button" disabled={busy} onClick={() => void (confirm.kind === 'video' ? mutate('admin-video-delete', { video_id: confirm.item.id }, 'videoDeleted') : mutate('admin-scenario-delete', { scenario_id: confirm.item.scenario_id }, 'scenarioDeleted'))}>{a(busy ? 'working' : 'confirmDelete')}</button></div>
    </section></div>}
  </section>;
}
