import { randomUUID } from 'node:crypto';
import sourceCatalog from '../src/data/catalog.json' with { type: 'json' };
import mediaManifest from '../src/data/media.json' with { type: 'json' };
import { localizeScenario, phaseLabel } from '../src/i18n/index.js';

export const CONTENT_PATH = 'content/catalog-v1.json';
export const SCENARIO_PHASES = Object.freeze(sourceCatalog.phase_roadmap.map((phase) => phase.id));
export const SCENARIO_VARIANTS = Object.freeze(['A', 'B', 'FA']);
const originalIds = new Set(sourceCatalog.combos.map((scenario) => scenario.scenario_id));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const copy = (value) => structuredClone(value);
const unique = (values) => [...new Set(values)].sort();
const tuple = (scenario) => [scenario.phase, scenario.own, scenario.opp, scenario.variant].join('|');

function initialContent() {
  return {
    schema: 1, revision: 0,
    scenarios: sourceCatalog.combos.map((scenario) => ({
      ...localizeScenario(scenario), status: 'published', original: true, video_id: scenario.video,
    })),
    videos: Object.entries(mediaManifest).map(([filename, video]) => ({
      ...video, id: filename, filename, original: true, verified: true,
    })),
  };
}

async function readContent(store) {
  const stored = await store.readVersion(CONTENT_PATH);
  const state = stored?.value || initialContent();
  if (state.schema !== 1 || !Number.isSafeInteger(state.revision) || !Array.isArray(state.scenarios) || !Array.isArray(state.videos)) {
    fail(503, 'Il catalogo non è disponibile. Nessuna modifica è stata confermata.');
  }
  return { state, etag: stored?.etag || null };
}

function metadata(scenarios) {
  const phases = SCENARIO_PHASES.filter((phase) => scenarios.some((scenario) => scenario.phase === phase));
  const ownByPhase = {};
  const oppByPhaseOwn = {};
  const variantsByPair = {};
  for (const phase of phases) {
    const items = scenarios.filter((scenario) => scenario.phase === phase);
    ownByPhase[phase] = unique(items.map((scenario) => scenario.own));
    oppByPhaseOwn[phase] = Object.fromEntries(ownByPhase[phase].map((own) => [
      own, unique(items.filter((scenario) => scenario.own === own).map((scenario) => scenario.opp)),
    ]));
  }
  for (const scenario of scenarios) {
    const key = [scenario.phase, scenario.own, scenario.opp].join('|');
    variantsByPair[key] = unique([...(variantsByPair[key] || []), scenario.variant]);
  }
  return {
    version: sourceCatalog.version, phases,
    phase_roadmap: sourceCatalog.phase_roadmap.map((phase) => ({
      ...phase, label: phaseLabel(phase.id), available: phases.includes(phase.id),
    })),
    formations: unique([...sourceCatalog.formations, ...scenarios.flatMap((scenario) => [scenario.own, scenario.opp])]),
    own_by_phase: ownByPhase, opp_by_phase_own: oppByPhaseOwn,
    variants_by_phase_pair: variantsByPair, press_by_phase_pair: variantsByPair,
  };
}

function withVideo(scenario, state) {
  const video = state.videos.find((item) => item.id === scenario.video_id && item.verified && !item.deleting);
  return { ...scenario, video: video?.filename || '', video_url: video?.url || '' };
}

function adminResponse(state) {
  return {
    ...metadata(state.scenarios), phases: [...SCENARIO_PHASES], variants: [...SCENARIO_VARIANTS],
    revision: state.revision,
    scenarios: state.scenarios.map((scenario) => withVideo(scenario, state)),
    videos: copy(state.videos),
  };
}

export async function getAdminContent(store) {
  return adminResponse((await readContent(store)).state);
}

export async function getPublishedCatalog(store) {
  const { state } = await readContent(store);
  const combos = state.scenarios.filter((scenario) => scenario.status === 'published')
    .map((scenario) => withVideo(scenario, state)).filter((scenario) => scenario.video_url)
    .map((scenario) => {
      const result = { ...scenario };
      delete result.status;
      delete result.original;
      delete result.video_id;
      return result;
    });
  return { ...metadata(combos), revision: state.revision, combos };
}

async function updateContent(store, revision, apply) {
  const { state, etag } = await readContent(store);
  if (!Number.isSafeInteger(revision) || revision !== state.revision) {
    fail(409, 'Il catalogo è stato aggiornato. Ricarica i contenuti prima di salvare.');
  }
  await apply(state);
  state.revision += 1;
  await store.writeVersion(CONTENT_PATH, state, etag);
  return adminResponse(state);
}

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some((char) => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char))) {
    fail(400, `${label}: inserisci un testo valido, fino a ${max} caratteri.`);
  }
  return value.trim();
}

function textList(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    fail(400, `${label}: inserisci da 1 a 20 elementi.`);
  }
  return value.map((item) => text(item, label, 600));
}

export function isFormation(value) {
  return typeof value === 'string' && /^[1-5](?:-[1-5]){1,4}$/.test(value) &&
    value.split('-').reduce((sum, count) => sum + Number(count), 0) === 10;
}

function validatedScenario(input, existing, state) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Scenario non valido.');
  const allowed = new Set(['scenario_id', 'phase', 'own', 'opp', 'variant', 'title', 'objective', 'principles',
    'key_actions', 'coaching_points', 'risk_notes', 'profile', 'video_id', 'status']);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail(400, 'Lo scenario contiene campi non consentiti.');
  if (!SCENARIO_PHASES.includes(input.phase) || !SCENARIO_VARIANTS.includes(input.variant) ||
      !isFormation(input.own) || !isFormation(input.opp)) fail(400, 'Fase, sistema di gioco o variante non validi.');
  if (!input.profile || Array.isArray(input.profile) || typeof input.profile !== 'object' ||
      Object.keys(input.profile).some((key) => !['risk', 'verticality', 'tempo'].includes(key))) fail(400, 'Profilo tattico non valido.');
  const videoId = input.video_id || null;
  if (videoId !== null && (typeof videoId !== 'string' || !state.videos.some((video) => video.id === videoId && video.verified && !video.deleting))) {
    fail(400, 'Seleziona un video verificato dalla libreria.');
  }
  return {
    scenario_id: existing?.scenario_id || `custom-${randomUUID()}`,
    phase: input.phase, phase_label: phaseLabel(input.phase), own: input.own, opp: input.opp,
    variant: input.variant, press: input.variant, label: `Soluzione ${input.variant}`,
    title: text(input.title, 'Titolo', 160), objective: text(input.objective, 'Obiettivo', 2000),
    principles: textList(input.principles, 'Principi di gioco'), key_actions: textList(input.key_actions, 'Azioni chiave'),
    coaching_points: textList(input.coaching_points, "Indicazioni per l'allenatore"), risk_notes: textList(input.risk_notes, 'Rischi tattici'),
    profile: { risk: text(input.profile.risk, 'Rischio', 80), verticality: text(input.profile.verticality, 'Verticalità', 80), tempo: text(input.profile.tempo, 'Ritmo', 80) },
    status: 'draft', original: Boolean(existing?.original), video_id: videoId,
  };
}

export async function saveScenario(store, { revision, scenario } = {}) {
  return updateContent(store, revision, (state) => {
    const existing = state.scenarios.find((item) => item.scenario_id === scenario?.scenario_id);
    if (scenario?.scenario_id && !existing) fail(404, 'Scenario non trovato.');
    const next = validatedScenario(scenario, existing, state);
    if (existing) state.scenarios[state.scenarios.indexOf(existing)] = next;
    else {
      if (state.scenarios.length >= 1000) fail(400, 'È stato raggiunto il limite di 1000 scenari.');
      state.scenarios.push(next);
    }
  });
}

export async function setScenarioStatus(store, { revision, scenario_id: scenarioId, status } = {}) {
  return updateContent(store, revision, (state) => {
    if (!['published', 'draft', 'inactive'].includes(status)) fail(400, 'Stato dello scenario non valido.');
    const scenario = state.scenarios.find((item) => item.scenario_id === scenarioId);
    if (!scenario) fail(404, 'Scenario non trovato.');
    if (status === 'published') {
      if (!state.videos.some((video) => video.id === scenario.video_id && video.verified && !video.deleting)) fail(400, 'Per pubblicare è necessario un video MP4 verificato.');
      if (state.scenarios.some((item) => item !== scenario && item.status === 'published' && tuple(item) === tuple(scenario))) {
        fail(409, 'Esiste già uno scenario pubblicato per questa fase, questi sistemi di gioco e questa variante.');
      }
    }
    scenario.status = status;
  });
}

export async function deleteScenario(store, { revision, scenario_id: scenarioId } = {}) {
  return updateContent(store, revision, (state) => {
    const scenario = state.scenarios.find((item) => item.scenario_id === scenarioId);
    if (!scenario) fail(404, 'Scenario non trovato.');
    if (originalIds.has(scenarioId)) fail(400, 'Gli scenari originali si conservano come backup. Puoi disattivarli.');
    state.scenarios = state.scenarios.filter((item) => item !== scenario);
  });
}

// Upload completion can race an editor. Retry its small independent registry
// update on CAS conflicts; never retry an editor's stale scenario document.
async function registryUpdate(store, apply) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state } = await readContent(store);
    try { return await updateContent(store, state.revision, apply); }
    catch (error) { if (error.status !== 409 || attempt === 3) throw error; }
  }
}

export async function registerVideo(store, video) {
  return registryUpdate(store, (state) => {
    const existing = state.videos.find((item) => item.id === video.id);
    if (existing) {
      if (existing.pathname !== video.pathname || existing.url !== video.url || existing.size !== video.size) fail(400, 'Il video è già registrato con dati diversi.');
      return;
    }
    if (state.videos.length >= 1000) fail(400, 'È stato raggiunto il limite di 1000 video.');
    state.videos.push({ ...video, original: false, verified: true });
  });
}

export async function markVideoDeleting(store, { revision, video_id: videoId } = {}) {
  return updateContent(store, revision, (state) => {
    const video = state.videos.find((item) => item.id === videoId);
    if (!video) fail(404, 'Video non trovato.');
    if (video.original) fail(400, 'I 24 video originali si conservano come backup e non possono essere eliminati.');
    if (state.scenarios.some((scenario) => scenario.video_id === videoId)) fail(409, 'Il video è associato a uno scenario. Sostituiscilo o rimuovi lo scenario prima di eliminarlo.');
    video.deleting = true;
  });
}

export async function removeVideoRecord(store, videoId) {
  return registryUpdate(store, (state) => {
    const video = state.videos.find((item) => item.id === videoId);
    if (!video) return;
    if (video.original || !video.deleting || state.scenarios.some((scenario) => scenario.video_id === videoId)) fail(409, 'Il video non può essere eliminato.');
    state.videos = state.videos.filter((item) => item !== video);
  });
}
