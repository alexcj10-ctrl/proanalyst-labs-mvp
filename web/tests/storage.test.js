import test from 'node:test';
import assert from 'node:assert/strict';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { privateStore } from '../server/storage.js';

test('catalog writes use a strong ETag from the same uncompressed read and still reject stale writers', async () => {
  let etag = '"first"';
  let value = { revision: 1 };
  const store = privateStore({ env: { PRIVATE_STORE_ID: 'test-store' }, io: {
    async get(path, options) {
      assert.equal(path, 'content/catalog-v1.json');
      assert.equal(options.useCache, false);
      return { statusCode: 200, blob: { etag: options.headers?.['Accept-Encoding'] === 'identity' ? etag : `W/${etag}` }, stream: new Response(JSON.stringify(value)).body };
    },
    async put(path, body, options) {
      assert.equal(path, 'content/catalog-v1.json');
      if (options.ifMatch !== etag) throw new BlobPreconditionFailedError();
      value = JSON.parse(body); etag = '"second"'; return { etag };
    },
  } });
  const first = await store.readVersion('content/catalog-v1.json');
  await store.writeVersion('content/catalog-v1.json', { revision: 2 }, first.etag);
  assert.deepEqual((await store.readVersion('content/catalog-v1.json')).value, { revision: 2 });
  await assert.rejects(store.writeVersion('content/catalog-v1.json', { revision: 3 }, first.etag), { status: 409 });
});
