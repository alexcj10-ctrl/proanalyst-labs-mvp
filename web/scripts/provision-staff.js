// Invoked by the migration operator, never bundled or served to browsers.
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { passwordHash } from '../server/app.js';

const link = JSON.parse(await readFile(new URL('../.vercel/project.json', import.meta.url)));
if (link.projectId !== 'prj_Mlq2vXazedm3goNlECwBKJhHS9x3' || link.orgId !== 'team_DI9iHDsJZdoTy03PoL0mgqrX') throw new Error('Unexpected target; stopped');
const destination = process.env.STAFF_ACCESS_FILE;
if (!destination) throw new Error('STAFF_ACCESS_FILE must point outside the repository');
let credentials;
try { credentials = JSON.parse(await readFile(destination, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = { username: 'admin', password: randomBytes(24).toString('base64url'), project: link.projectId };
  await writeFile(destination, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' });
}
if (credentials.project !== link.projectId) throw new Error('Credentials target mismatch');
const hash = await passwordHash(credentials.password);
for (const [key, value] of [['STAFF_USER', credentials.username], ['STAFF_PASSWORD_HASH', hash]]) {
  await new Promise((resolve, reject) => {
    const child = spawn('npx.cmd', ['--yes', 'vercel', 'env', 'add', key, '--environment', 'preview', '--git-branch', 'migration/react-vite-vercel', '--project', link.projectId, '--scope', 'alejandros-projects-a7058275', '--type', 'secret', '--force', '--yes'], { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Vercel rejected ${key}: ${output.replaceAll(value, '[redacted]')}`)));
    child.stdin.end(value);
  });
  console.log(`${key} configured for migration preview only.`);
}
console.log('Staff credentials saved locally outside the repository; password not printed.');
