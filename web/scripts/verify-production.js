// Read-only release checks: never submit feedback or scenario requests.
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import originalCatalog from '../src/data/catalog.json' with { type: 'json' };
import originalMedia from '../src/data/media.json' with { type: 'json' };
const origin = new URL(process.argv[2]).origin;
if (!/^https:\/\/proanalyst-labs-[a-z0-9]+-alejandros-projects-a7058275\.vercel\.app$/.test(origin)) throw new Error('Unexpected deployment');
const project = JSON.parse(await readFile('.vercel/project.json'));
assert.equal(project.projectId, 'prj_Mlq2vXazedm3goNlECwBKJhHS9x3');
const credentials = JSON.parse(await readFile(process.env.STAFF_ACCESS_FILE));
assert.equal(credentials.project, project.projectId);
const cookies = 'test-results/staff-production-cookie.local';
let csrfToken = '';
async function request(path, body) {
  const args = ['--yes', 'vercel@65.15.0', 'curl', `${origin}${path}`, '--scope', 'alejandros-projects-a7058275', '--', '-sS', '-w', '"\\n%{http_code}"', '-b', cookies, '-c', cookies];
  if (csrfToken) args.push('-H', `"X-CSRF-Token: ${csrfToken}"`);
  if (body !== undefined) args.push('-X', 'POST', '-H', '"Content-Type: application/json"', '-H', `"Origin: ${origin}"`, '--data-binary', '@-');
  const output = await new Promise((resolve, reject) => {
    const child = spawn('npx.cmd', args, { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let data = '';
    child.stdout.on('data', (chunk) => { data += chunk; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(data) : reject(new Error(`HTTP check failed for ${path}`)));
    child.stdin.end(body === undefined ? '' : JSON.stringify(body));
  });
  const split = output.lastIndexOf('\n');
  return { status: Number(output.slice(split + 1).trim()), text: output.slice(0, split) };
}
try {
  const home = await request('/');
  assert.equal(home.status, 200); assert.match(home.text, /lang="it"/);
  const catalog = await request('/api/catalog');
  assert.equal(catalog.status, 200);
  const publicCatalog = JSON.parse(catalog.text);
  assert.ok(Array.isArray(publicCatalog.combos));
  for (const [action, body] of [['insights'], ['admin-content'], ['admin-events'], ['admin-scenarios', { publish: true }],
    ['admin-scenario-status', {}], ['admin-scenario-delete', {}], ['admin-video-delete', {}],
    ['admin-upload-intent', {}], ['admin-upload-token', {}], ['admin-upload-complete', {}]]) {
    assert.equal((await request(`/api/${action}`, body)).status, 403, action);
  }
  const login = await request('/api/login', credentials);
  assert.equal(login.status, 200); csrfToken = JSON.parse(login.text).csrfToken;
  assert.match(csrfToken, /^[a-f0-9]{64}$/);
  const insights = await request('/api/insights'); assert.equal(insights.status, 200);
  const stats = JSON.parse(insights.text);
  assert.equal(typeof stats.feedback_count, 'number');
  const content = await request('/api/admin-content');
  assert.equal(content.status, 200);
  const state = JSON.parse(content.text);
  for (const original of originalCatalog.combos) assert.ok(state.scenarios.some(s => s.scenario_id === original.scenario_id && s.original));
  for (const [filename, media] of Object.entries(originalMedia)) assert.ok(state.videos.some(v => v.id === filename && v.original && v.verified && v.url === media.url));
  const publishedIds = state.scenarios.filter(s => s.status === 'published' && s.video_url).map(s => s.scenario_id).sort();
  assert.deepEqual(publicCatalog.combos.map(s => s.scenario_id).sort(), publishedIds);
  assert.equal((await request('/api/logout', {})).status, 200);
  assert.equal((await request('/api/insights')).status, 403);
  console.log(`Production checks passed: Italian HTML, all 24 original scenarios/videos preserved, ${publishedIds.length} published scenarios match public catalog, all 10 administrative APIs reject public users, owner login, private insights/content and logout. No submissions created.`);
} finally { await rm(cookies, { force: true }); }
