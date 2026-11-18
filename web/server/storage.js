import { put, get, list, del, BlobPreconditionFailedError } from '@vercel/blob';

export function privateStore({ env = process.env, io = { put, get, list, del } } = {}) {
  const storeId = env.PRIVATE_STORE_ID;
  if (!storeId) throw new Error('Private storage is not configured');
  return {
    // Content edits use the ETag from the same uncached read as the value. A
    // stale editor can never silently overwrite a newer publish or upload.
    async readVersion(path) {
      // Compressed CDN responses have weak ETags, which cannot be used by If-Match.
      // Identity encoding keeps the strong ETag and document from the same read.
      const result = await io.get(path, { storeId, access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
      if (!result) return null;
      if (result.statusCode !== 200 || !result.blob.etag) throw new Error('Private read failed');
      return { value: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag };
    },
    async writeVersion(path, value, etag = null) {
      try {
        const result = await io.put(path, JSON.stringify(value), {
          storeId, access: 'private', addRandomSuffix: false,
          allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}),
          contentType: 'application/json', cacheControlMaxAge: 60,
        });
        return { etag: result.etag };
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || (!etag && /already exists/i.test(error.message))) {
          throw Object.assign(new Error('Il catalogo è stato aggiornato. Ricarica i contenuti prima di salvare.'), { status: 409 });
        }
        throw error;
      }
    },
    async read(path) {
      const result = await io.get(path, { storeId, access: 'private', useCache: false });
      if (!result) return null;
      if (result.statusCode !== 200) throw new Error('Private read failed');
      return JSON.parse(await new Response(result.stream).text());
    },
    async create(path, value, ttlDays) {
      await io.put(path, JSON.stringify(value), {
        storeId, access: 'private', addRandomSuffix: false, allowOverwrite: false,
        contentType: 'application/json', ...(ttlDays ? { ttlDays } : {}),
      });
    },
    async remove(path) { await io.del(path, { storeId }); },
    async scan(prefix) {
      const paths = [];
      let cursor;
      do {
        const page = await io.list({ storeId, prefix, cursor, limit: 1000 });
        paths.push(...page.blobs.map((blob) => blob.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      const values = [];
      for (let i = 0; i < paths.length; i += 10) {
        values.push(...await Promise.all(paths.slice(i, i + 10).map((path) => this.read(path))));
      }
      return values.filter(Boolean);
    },
  };
}
