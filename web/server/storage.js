import { put, get, list, del } from '@vercel/blob';

export function privateStore() {
  const storeId = process.env.PRIVATE_STORE_ID;
  if (!storeId) throw new Error('Private storage is not configured');
  return {
    async read(path) {
      const result = await get(path, { storeId, access: 'private', useCache: false });
      if (!result) return null;
      if (result.statusCode !== 200) throw new Error('Private read failed');
      return JSON.parse(await new Response(result.stream).text());
    },
    async create(path, value, ttlDays) {
      await put(path, JSON.stringify(value), {
        storeId, access: 'private', addRandomSuffix: false, allowOverwrite: false,
        contentType: 'application/json', ...(ttlDays ? { ttlDays } : {}),
      });
    },
    async remove(path) { await del(path, { storeId }); },
    async scan(prefix) {
      const paths = [];
      let cursor;
      do {
        const page = await list({ storeId, prefix, cursor, limit: 1000 });
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
