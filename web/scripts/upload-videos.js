import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { put, list } from '@vercel/blob';

const catalog = JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url)));
const output = new URL('../src/data/media.json', import.meta.url);
const storeId = process.env.MEDIA_STORE_ID;
const project = JSON.parse(await readFile(new URL('../.vercel/project.json', import.meta.url)));
if (project.projectId !== 'prj_Mlq2vXazedm3goNlECwBKJhHS9x3' || project.orgId !== 'team_DI9iHDsJZdoTy03PoL0mgqrX') {
  throw new Error('Upload refused: linked project must be ProAnalyst Labs.');
}
if (storeId !== 'store_2stKkhbsYQ1x19nV') throw new Error('Upload refused: unexpected public media store.');
const existing = new Map();
let cursor;
do {
  const page = await list({ storeId, prefix: 'tactics/', cursor });
  for (const blob of page.blobs) existing.set(blob.pathname, blob);
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
const manifest = {};
for (const item of catalog.combos) {
  const file = new URL(`../../backend/videos/${item.video}`, import.meta.url);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  const size = (await stat(file)).size;
  const pathname = `tactics/${sha256}/${item.video}`;
  let blob = existing.get(pathname);
  if (!blob) {
    blob = await put(pathname, createReadStream(fileURLToPath(file)), {
      storeId, access: 'public', addRandomSuffix: false, allowOverwrite: false,
      multipart: true, contentType: 'video/mp4', cacheControlMaxAge: 31536000,
    });
  }
  const head = await fetch(blob.url, { method: 'HEAD' });
  if (!head.ok || Number(head.headers.get('content-length')) !== size) throw new Error(`HEAD verification failed: ${item.video}`);
  const ranged = await fetch(blob.url, { headers: { Range: 'bytes=0-31' } });
  const bytes = Buffer.from(await ranged.arrayBuffer());
  if (ranged.status !== 206 || bytes.length !== 32 || !bytes.includes(Buffer.from('ftyp'))) throw new Error(`MP4/range verification failed: ${item.video}`);
  manifest[item.video] = { url: blob.url, pathname, sha256, size };
  await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Verified ${Object.keys(manifest).length}/24 ${item.video} (${size} bytes)`);
}
if (Object.keys(manifest).length !== 24) throw new Error('Expected exactly 24 videos');
console.log('All 24 real Blob URLs verified; original files unchanged.');
