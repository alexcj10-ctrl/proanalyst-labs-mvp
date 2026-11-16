import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sourceCatalog from '../src/data/catalog.json' with { type: 'json' };
import media from '../src/data/media.json' with { type: 'json' };
import { localizeScenario } from '../src/i18n/index.js';
import { memoryStore } from './helpers/memory-store.js';
import { getAdminContent, getPublishedCatalog, saveScenario, setScenarioStatus, deleteScenario,
  registerVideo, markVideoDeleting, removeVideoRecord, isFormation } from '../server/content.js';

function scenarioInput(overrides = {}) {
  const source = localizeScenario(sourceCatalog.combos[0]);
  const keys = ['phase', 'own', 'opp', 'variant', 'title', 'objective', 'principles', 'key_actions', 'coaching_points', 'risk_notes', 'profile'];
  return { ...Object.fromEntries(keys.map((key) => [key, source[key]])),
    phase: 'progression', video_id: source.video, ...overrides };
}

test('private seed preserves every original tactical field, technical ID and video association', async () => {
  const { store, values } = memoryStore();
  const published = await getPublishedCatalog(store);
  const admin = await getAdminContent(store);
  assert.equal(published.combos.length, 24);
  assert.equal(admin.scenarios.length, 24);
  assert.equal(admin.videos.length, 24);
  assert.equal(values.size, 0, 'Reading seed never initializes or changes persistent content');
  for (const source of sourceCatalog.combos) {
    const scenario = published.combos.find((item) => item.scenario_id === source.scenario_id);
    const { video_url: url, ...fields } = scenario;
    assert.deepEqual(fields, localizeScenario(source));
    assert.equal(url, media[source.video].url);
  }
});

test('draft, publish, deactivate and delete persist independently of a deploy', async () => {
  const { store } = memoryStore();
  let state = await saveScenario(store, { revision: 0, scenario: scenarioInput() });
  const created = state.scenarios.find((item) => !item.original);
  assert.match(created.scenario_id, /^custom-/);
  assert.equal(created.status, 'draft');
  assert.equal((await getPublishedCatalog(store)).combos.length, 24);
  state = await setScenarioStatus(store, { revision: state.revision, scenario_id: created.scenario_id, status: 'published' });
  let publicCatalog = await getPublishedCatalog(store);
  assert.equal(publicCatalog.combos.length, 25);
  assert.ok(publicCatalog.phases.includes('progression'));
  assert.equal(publicCatalog.phase_roadmap.find((phase) => phase.id === 'progression').available, true);
  assert.ok(publicCatalog.variants_by_phase_pair['progression|3-5-2|3-5-2'].includes('A'));
  state = await setScenarioStatus(store, { revision: state.revision, scenario_id: created.scenario_id, status: 'inactive' });
  publicCatalog = await getPublishedCatalog(store);
  assert.equal(publicCatalog.combos.length, 24);
  assert.ok(!publicCatalog.phases.includes('progression'));
  assert.ok(!JSON.stringify(publicCatalog).includes(created.scenario_id));
  state = await deleteScenario(store, { revision: state.revision, scenario_id: created.scenario_id });
  assert.equal(state.scenarios.length, 24);
});

test('an edit becomes a draft; publishing rejects ambiguous deterministic combinations', async () => {
  const { store } = memoryStore();
  const original = sourceCatalog.combos[0];
  let state = await saveScenario(store, { revision: 0, scenario: scenarioInput({
    scenario_id: original.scenario_id, phase: original.phase, title: 'Uomo libero tra le linee',
  }) });
  assert.equal(state.scenarios.length, 24);
  assert.equal((await getPublishedCatalog(store)).combos.length, 23);
  state = await setScenarioStatus(store, { revision: state.revision, scenario_id: original.scenario_id, status: 'published' });
  assert.equal((await getPublishedCatalog(store)).combos.find((item) => item.scenario_id === original.scenario_id).title, 'Uomo libero tra le linee');
  state = await saveScenario(store, { revision: state.revision, scenario: scenarioInput({ phase: original.phase }) });
  const duplicate = state.scenarios.find((item) => !item.original);
  await assert.rejects(setScenarioStatus(store, { revision: state.revision, scenario_id: duplicate.scenario_id, status: 'published' }), { status: 409 });
  assert.equal((await getPublishedCatalog(store)).combos.length, 24);
});

test('ETag and client revision prevent lost updates from simultaneous editors', async () => {
  const { store } = memoryStore();
  const results = await Promise.allSettled([
    saveScenario(store, { revision: 0, scenario: scenarioInput({ title: 'Primo aggiornamento' }) }),
    saveScenario(store, { revision: 0, scenario: scenarioInput({ title: 'Secondo aggiornamento' }) }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  await assert.rejects(saveScenario(store, { revision: 0, scenario: scenarioInput() }), { status: 409 });
  assert.equal((await getAdminContent(store)).revision, 1);
});

test('validation rejects forged media, roles, malformed tactics and unsupported identifiers', async () => {
  const { store } = memoryStore();
  for (const overrides of [
    { role: 'admin' }, { scenario_id: 'forged-id' }, { phase: '__proto__' }, { variant: 'ADMIN' },
    { own: '4-4-4' }, { opp: '../4-3-3' }, { title: 'x'.repeat(161) }, { objective: '' },
    { principles: [''] }, { key_actions: [] }, { risk_notes: Array(21).fill('Rischio') },
    { profile: { risk: 'Basso', verticality: 'Alta', tempo: 'Alto', admin: true } },
    { video_id: 'https://evil.invalid/file.mp4' },
  ]) {
    await assert.rejects(saveScenario(store, { revision: 0, scenario: scenarioInput(overrides) }), (error) => [400, 404].includes(error.status));
  }
  assert.ok(isFormation('4-2-2-2'));
  assert.ok(!isFormation('10'));
  assert.ok(!isFormation('4-3-2'));
  const state = await saveScenario(store, { revision: 0, scenario: scenarioInput({ video_id: null }) });
  const draft = state.scenarios.find((item) => !item.original);
  await assert.rejects(setScenarioStatus(store, { revision: state.revision, scenario_id: draft.scenario_id, status: 'published' }), { status: 400 });
});

test('originals are retained and media reservations protect against delete/attach races', async () => {
  const { store } = memoryStore();
  await assert.rejects(deleteScenario(store, { revision: 0, scenario_id: sourceCatalog.combos[0].scenario_id }), { status: 400 });
  await assert.rejects(markVideoDeleting(store, { revision: 0, video_id: sourceCatalog.combos[0].video }), { status: 400 });
  const id = randomUUID();
  const video = { id, filename: 'nuovo.mp4', pathname: `admin/preview/${id}.mp4`,
    url: `https://2stkkhbsyq1x19nv.public.blob.vercel-storage.com/admin/preview/${id}.mp4`, size: 100 };
  let state = await registerVideo(store, video);
  state = await saveScenario(store, { revision: state.revision, scenario: scenarioInput({ video_id: id }) });
  await assert.rejects(markVideoDeleting(store, { revision: state.revision, video_id: id }), { status: 409 });
  const scenario = state.scenarios.find((item) => !item.original);
  state = await deleteScenario(store, { revision: state.revision, scenario_id: scenario.scenario_id });
  state = await markVideoDeleting(store, { revision: state.revision, video_id: id });
  await assert.rejects(saveScenario(store, { revision: state.revision, scenario: scenarioInput({ video_id: id }) }), { status: 400 });
  state = await removeVideoRecord(store, id);
  assert.equal(state.videos.length, 24);
});

test('storage failure cannot acknowledge publication or replace the seed', async () => {
  const { store } = memoryStore();
  store.writeVersion = async () => { throw new Error('unavailable'); };
  await assert.rejects(saveScenario(store, { revision: 0, scenario: scenarioInput() }), /unavailable/);
  assert.equal((await getPublishedCatalog(store)).combos.length, 24);
});
