import { randomUUID } from 'node:crypto';
import { head, del, issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { getAdminContent, registerVideo, markVideoDeleting, removeVideoRecord } from './content.js';

export const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
const MEDIA_STORE_ID = 'store_2stKkhbsYQ1x19nV';
const MEDIA_HOST = '2stkkhbsyq1x19nv.public.blob.vercel-storage.com';
const tokenLifetime = 10 * 60 * 1000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

function settings(context = {}) {
  const env = context.env || process.env;
  if (!context.sessionId) fail(403, 'È richiesto l’accesso come amministratore.');
  if (env.MEDIA_STORE_ID !== MEDIA_STORE_ID) fail(503, 'Lo storage video di ProAnalyst Labs non è disponibile.');
  return {
    sessionId: context.sessionId, env, now: context.now ?? Date.now(), storeId: MEDIA_STORE_ID,
    namespace: env.VERCEL_ENV === 'production' ? 'production' : 'preview',
    io: { head, del, issueSignedToken, handleUploadPresigned, fetch: globalThis.fetch, ...(context.io || {}) },
  };
}

function intentPath(id) {
  if (typeof id !== 'string' || !uuid.test(id)) fail(400, 'Caricamento non valido.');
  return `uploads/${id}.json`;
}

function expectedPath(id, namespace) {
  return `admin/${namespace}/${id}.mp4`;
}

async function readIntent(store, uploadId, options) {
  const intent = await store.read(intentPath(uploadId));
  if (!intent || intent.sessionId !== options.sessionId || intent.storeId !== options.storeId || intent.namespace !== options.namespace) {
    fail(403, 'Questo caricamento non è autorizzato per la sessione corrente.');
  }
  if (intent.expires <= options.now) fail(410, 'Il caricamento è scaduto. Seleziona nuovamente il file.');
  if (intent.pathname !== expectedPath(uploadId, options.namespace)) fail(403, 'Percorso del video non autorizzato.');
  return intent;
}

export async function beginUpload(store, body, context) {
  const options = settings(context);
  if (!body || typeof body.filename !== 'string' || !/\.mp4$/i.test(body.filename) ||
      body.filename.length > 180 || /[\\/]/.test(body.filename) || [...body.filename].some((char) => char.charCodeAt(0) < 32) ||
      body.contentType !== 'video/mp4' || !Number.isSafeInteger(body.size) || body.size < 24 || body.size > MAX_VIDEO_BYTES) {
    fail(400, 'Seleziona un file MP4 valido, di dimensione non superiore a 256 MB.');
  }
  const id = randomUUID();
  const intent = {
    id, sessionId: options.sessionId, storeId: options.storeId, namespace: options.namespace,
    pathname: expectedPath(id, options.namespace), filename: body.filename, size: body.size, contentType: 'video/mp4',
    created_at: new Date(options.now).toISOString(), expires: options.now + tokenLifetime,
  };
  await store.create(intentPath(id), intent, 1);
  return { upload_id: id, pathname: intent.pathname, expires_at: intent.expires, maximum_size: MAX_VIDEO_BYTES };
}

export async function uploadToken(store, req, body, context) {
  const options = settings(context);
  if (body?.type !== 'blob.generate-presigned-url' || typeof body.payload?.clientPayload !== 'string' ||
      body.payload.clientPayload.length > 150 || body.payload.multipart !== true) {
    fail(400, 'Richiesta di caricamento non valida.');
  }
  let payload;
  try { payload = JSON.parse(body.payload.clientPayload); } catch { fail(400, 'Richiesta di caricamento non valida.'); }
  const intent = await readIntent(store, payload?.upload_id, options);
  if (body.payload.pathname !== intent.pathname) fail(403, 'Percorso del video non autorizzato.');
  const state = await getAdminContent(store);
  if (state.videos.some((video) => video.id === intent.id)) fail(409, 'Il video è già stato verificato.');
  const webhookPublicKey = options.env.MEDIA_WEBHOOK_PUBLIC_KEY || options.env.BLOB_WEBHOOK_PUBLIC_KEY;
  if (!webhookPublicKey) fail(503, 'Il caricamento diretto dei video non è ancora configurato.');
  // Only an authenticated browser may obtain a presigned upload. Callbacks are
  // not accepted: finalization requires that same owner session and validates
  // the object independently. No long-lived Blob credential reaches the client.
  return options.io.handleUploadPresigned({
    body, request: req, webhookPublicKey,
    getSignedToken: async (pathname) => {
      if (pathname !== intent.pathname) fail(403, 'Percorso del video non autorizzato.');
      return {
        token: await options.io.issueSignedToken({
          storeId: options.storeId, pathname: intent.pathname, operations: ['put'],
          allowedContentTypes: ['video/mp4'], maximumSizeInBytes: intent.size, validUntil: intent.expires,
        }),
        urlOptions: {
          allowedContentTypes: ['video/mp4'], maximumSizeInBytes: intent.size, validUntil: intent.expires,
          addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60,
        },
      };
    },
  });
}

function validBlobUrl(url, pathname) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === MEDIA_HOST && !parsed.port &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === `/${pathname}`;
  } catch { return false; }
}

// ISO BMFF ftyp validation complements extension, MIME, actual object size and
// the Blob upload constraints. Only a bounded range is fetched, never the video.
export function isMp4Header(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return false;
  const buffer = Buffer.from(bytes);
  const size = buffer.readUInt32BE(0);
  if (buffer.toString('ascii', 4, 8) !== 'ftyp' || size < 24 || size > Math.min(bytes.length, 4096) || size % 4 !== 0) return false;
  const brands = [buffer.toString('ascii', 8, 12)];
  for (let i = 16; i < size; i += 4) brands.push(buffer.toString('ascii', i, i + 4));
  return brands.some((brand) => ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].includes(brand));
}

async function readHeader(url, size, io) {
  const end = Math.min(size - 1, 4095);
  const response = await io.fetch(url, {
    headers: { Range: `bytes=0-${end}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 206 || response.headers.get('content-range') !== `bytes 0-${end}/${size}` ||
      Number(response.headers.get('content-length')) !== end + 1) {
    await response.body?.cancel();
    fail(400, 'Il video non supporta la riproduzione MP4 con ricerca temporale.');
  }
  // Stop after the requested range even if a broken origin ignores its length.
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) fail(400, 'Contenuto MP4 non valido.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  if (length !== end + 1) fail(400, 'Contenuto MP4 incompleto.');
  return Buffer.concat(chunks, length);
}

export async function finalizeUpload(store, body, context) {
  const options = settings(context);
  const intent = await readIntent(store, body?.upload_id, options);
  const state = await getAdminContent(store);
  const existing = state.videos.find((video) => video.id === intent.id);
  if (existing) return state;
  const metadata = await options.io.head(intent.pathname, { storeId: options.storeId });
  if (metadata.pathname !== intent.pathname || !validBlobUrl(metadata.url, intent.pathname)) {
    fail(400, 'Il video non appartiene allo storage autorizzato.');
  }
  try {
    if (metadata.contentType !== 'video/mp4' || metadata.size !== intent.size || metadata.size > MAX_VIDEO_BYTES) {
      fail(400, 'Il contenuto del file non corrisponde al video MP4 autorizzato.');
    }
    const header = await readHeader(metadata.url, metadata.size, options.io);
    if (!isMp4Header(header)) fail(400, 'Il file caricato non contiene un’intestazione MP4 valida.');
  } catch (error) {
    if (error.status === 400) {
      // Delete only this session's newly issued path; never any original or URL
      // supplied by the browser. Storage failures remain honest errors.
      await options.io.del(intent.pathname, { storeId: options.storeId });
      await store.remove(intentPath(intent.id));
    }
    throw error;
  }
  return registerVideo(store, {
    id: intent.id, filename: intent.filename, pathname: intent.pathname, url: metadata.url,
    size: metadata.size, contentType: 'video/mp4', created_at: intent.created_at,
  });
}

export async function deleteVideo(store, body, context) {
  const options = settings(context);
  const state = await getAdminContent(store);
  const video = state.videos.find((item) => item.id === body?.video_id);
  if (!video) fail(404, 'Video non trovato.');
  if (video.original) fail(400, 'I 24 video originali si conservano come backup e non possono essere eliminati.');
  if (!uuid.test(video.id) || video.pathname !== expectedPath(video.id, options.namespace) || !validBlobUrl(video.url, video.pathname)) {
    fail(403, 'Percorso del video non autorizzato.');
  }
  await markVideoDeleting(store, body);
  // The persisted tombstone prevents a concurrent editor from attaching the
  // object between the reference check and its physical deletion.
  await options.io.del(video.pathname, { storeId: options.storeId });
  await store.remove(intentPath(video.id));
  return removeVideoRecord(store, video.id);
}
