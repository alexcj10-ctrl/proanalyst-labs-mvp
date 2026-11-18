import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './helpers/memory-store.js';
import { getAdminContent } from '../server/content.js';
import { beginUpload, uploadToken, finalizeUpload, deleteVideo, isMp4Header, MAX_VIDEO_BYTES } from '../server/media.js';

const env = { MEDIA_STORE_ID: 'store_2stKkhbsYQ1x19nV', VERCEL_ENV: 'preview', BLOB_WEBHOOK_PUBLIC_KEY: 'test-only-public-key' };
const now = 1800000000000;
const context = { env, now, sessionId: 'test-only-server-session-identity' };
const file = { filename: 'allenamento.mp4', size: 48, contentType: 'video/mp4' };

function mp4Bytes() {
  const bytes = Buffer.alloc(48);
  bytes.writeUInt32BE(24, 0); bytes.write('ftyp', 4); bytes.write('isom', 8); bytes.write('isommp42', 16);
  bytes.writeUInt32BE(24, 24); bytes.write('mdat', 28);
  return bytes;
}

function ioFor(intent, overrides = {}) {
  const deleted = [];
  const reads = [];
  const tokenOptions = [];
  const url = `https://2stkkhbsyq1x19nv.public.blob.vercel-storage.com/${intent.pathname}`;
  const io = {
    async head(pathname, options) {
      assert.equal(pathname, intent.pathname);
      assert.equal(options.storeId, env.MEDIA_STORE_ID);
      return { pathname, url, size: file.size, contentType: 'video/mp4' };
    },
    async fetch(requestUrl, options) {
      reads.push(requestUrl);
      assert.equal(requestUrl, url);
      assert.equal(options.headers.Range, 'bytes=0-47');
      assert.equal(options.redirect, 'error');
      return new Response(mp4Bytes(), { status: 206,
        headers: { 'content-range': 'bytes 0-47/48', 'content-length': '48' } });
    },
    async del(pathname, options) { deleted.push(pathname); assert.equal(options.storeId, env.MEDIA_STORE_ID); },
    async issueSignedToken(options) { tokenOptions.push(options); return { delegationToken: 'test-delegation', clientSigningToken: 'test-secret', validUntil: options.validUntil }; },
    async handleUploadPresigned(options) {
      const result = await options.getSignedToken(options.body.payload.pathname);
      assert.equal(options.onUploadCompleted, undefined);
      assert.equal(result.urlOptions.allowOverwrite, false);
      assert.equal(result.urlOptions.addRandomSuffix, false);
      return { type: 'blob.generate-presigned-url', presignedUrlPayload: { delegationToken: result.token.delegationToken, signature: 'test-signature' } };
    },
    ...overrides,
  };
  return { io, deleted, reads, tokenOptions };
}

function tokenRequest(intent) {
  return { type: 'blob.generate-presigned-url', payload: {
    pathname: intent.pathname, multipart: true, clientPayload: JSON.stringify({ upload_id: intent.upload_id }),
  } };
}

test('upload preparation enforces an owner session, fixed store, MP4 type and size', async () => {
  const { store, values } = memoryStore();
  await assert.rejects(beginUpload(store, file, { env }), { status: 403 });
  await assert.rejects(beginUpload(store, file, { ...context, env: { MEDIA_STORE_ID: 'another-store' } }), { status: 503 });
  for (const invalid of [
    { filename: '../file.mp4' }, { filename: 'x.exe' }, { contentType: 'application/octet-stream' },
    { size: 0 }, { size: MAX_VIDEO_BYTES + 1 }, { size: 3.5 }, { filename: 'video.mp4\0' },
  ]) await assert.rejects(beginUpload(store, { ...file, ...invalid }, context), { status: 400 });
  assert.equal(values.size, 0);
  const intent = await beginUpload(store, file, context);
  assert.match(intent.pathname, /^admin\/preview\/[a-f0-9-]+\.mp4$/);
  assert.equal(intent.expires_at, now + 600000);
  assert.ok(!JSON.stringify(intent).includes(context.sessionId));
});

test('temporary delegation is restricted to its exact session, path, content type and maximum bytes', async () => {
  const { store } = memoryStore();
  const intent = await beginUpload(store, file, context);
  const fixture = ioFor(intent);
  const options = { ...context, io: fixture.io };
  const request = tokenRequest(intent);
  const token = await uploadToken(store, { headers: {} }, request, options);
  assert.equal(token.type, 'blob.generate-presigned-url');
  assert.ok(!JSON.stringify(token).includes('test-secret'));
  assert.deepEqual(fixture.tokenOptions[0], {
    storeId: env.MEDIA_STORE_ID, pathname: intent.pathname, operations: ['put'],
    allowedContentTypes: ['video/mp4'], maximumSizeInBytes: file.size, validUntil: now + 600000,
  });
  await assert.rejects(uploadToken(store, {}, request, { ...options, sessionId: 'other' }), { status: 403 });
  await assert.rejects(uploadToken(store, {}, request, { ...options, now: now + 600001 }), { status: 410 });
  await assert.rejects(uploadToken(store, {}, { ...request, payload: { ...request.payload, pathname: 'tactics/original.mp4' } }, options), { status: 403 });
  await assert.rejects(uploadToken(store, {}, { type: 'blob.upload-completed', payload: {} }, options), { status: 400 });
  await assert.rejects(uploadToken(store, {}, request, { ...options, env: { ...env, BLOB_WEBHOOK_PUBLIC_KEY: undefined } }), { status: 503 });
  assert.equal(fixture.tokenOptions.length, 1);
});

test('only verified uploaded objects become reusable videos; finalize is idempotent', async () => {
  const { store } = memoryStore();
  const intent = await beginUpload(store, file, context);
  const fixture = ioFor(intent);
  const options = { ...context, io: fixture.io };
  const state = await finalizeUpload(store, intent, options);
  const video = state.videos.find((item) => item.id === intent.upload_id);
  assert.equal(video.verified, true);
  assert.equal(video.original, false);
  assert.equal(video.filename, file.filename);
  assert.equal(state.videos.length, 25);
  assert.equal(state.scenarios.length, 24);
  assert.deepEqual(await finalizeUpload(store, intent, options), state);
  assert.equal(fixture.reads.length, 1);
  assert.equal(fixture.deleted.length, 0);
  await assert.rejects(uploadToken(store, {}, tokenRequest(intent), options), { status: 409 });
});

test('spoofed MP4 bytes are rejected and only the newly issued object is removed', async () => {
  const { store } = memoryStore();
  const intent = await beginUpload(store, file, context);
  const fixture = ioFor(intent, { async fetch() {
    return new Response(Buffer.alloc(48), { status: 206, headers: { 'content-range': 'bytes 0-47/48', 'content-length': '48' } });
  } });
  await assert.rejects(finalizeUpload(store, intent, { ...context, io: fixture.io }), { status: 400 });
  assert.deepEqual(fixture.deleted, [intent.pathname]);
  assert.equal((await getAdminContent(store)).videos.length, 24);
  assert.equal(await store.read(`uploads/${intent.upload_id}.json`), null);
});

test('finalization does not follow arbitrary URLs, mismatched lengths or ignored Range responses', async () => {
  for (const kind of ['url', 'size', 'range']) {
    const { store } = memoryStore();
    const intent = await beginUpload(store, file, context);
    const fixture = ioFor(intent);
    if (kind === 'url') fixture.io.head = async () => ({ pathname: intent.pathname, url: 'https://evil.invalid/x.mp4', size: 48, contentType: 'video/mp4' });
    if (kind === 'size') fixture.io.head = async () => ({ pathname: intent.pathname, url: `https://2stkkhbsyq1x19nv.public.blob.vercel-storage.com/${intent.pathname}`, size: 99, contentType: 'video/mp4' });
    if (kind === 'range') fixture.io.fetch = async () => new Response(mp4Bytes(), { status: 200 });
    await assert.rejects(finalizeUpload(store, intent, { ...context, io: fixture.io }), { status: 400 });
    assert.equal((await getAdminContent(store)).videos.length, 24);
    if (kind === 'url') assert.equal(fixture.deleted.length, 0);
  }
  assert.ok(isMp4Header(mp4Bytes()));
  assert.ok(!isMp4Header(new Uint8Array(3)));
  const bytes = mp4Bytes(); bytes.write('qt  ', 8); bytes.write('qt  qt  ', 16);
  assert.ok(!isMp4Header(bytes));
});

test('video deletion protects original backups and cannot target a different environment', async () => {
  const { store } = memoryStore();
  const intent = await beginUpload(store, file, context);
  const fixture = ioFor(intent);
  const options = { ...context, io: fixture.io };
  let state = await finalizeUpload(store, intent, options);
  await assert.rejects(deleteVideo(store, { revision: state.revision, video_id: state.videos[0].id }, options), { status: 400 });
  await assert.rejects(deleteVideo(store, { revision: state.revision, video_id: intent.upload_id }, { ...options, env: { ...env, VERCEL_ENV: 'production' } }), { status: 403 });
  assert.equal(fixture.deleted.length, 0);
  state = await deleteVideo(store, { revision: state.revision, video_id: intent.upload_id }, options);
  assert.deepEqual(fixture.deleted, [intent.pathname]);
  assert.equal(state.videos.length, 24);
  assert.equal(state.scenarios.length, 24);
});
