// A test-only private object store. Versioned writes model Blob's atomic ETag checks.
export function memoryStore() {
  const values = new Map();
  const versions = new Map();
  let sequence = 0;
  const copy = (value) => value == null ? null : structuredClone(value);
  const conflict = () => Object.assign(new Error('Version conflict'), { status: 409 });
  const store = {
    async read(key) { return copy(values.get(key)); },
    async create(key, value) {
      if (values.has(key)) throw conflict();
      values.set(key, copy(value));
      versions.set(key, String(++sequence));
    },
    async remove(key) { values.delete(key); versions.delete(key); },
    async scan(prefix) {
      return [...values].filter(([key]) => key.startsWith(prefix)).map(([, value]) => copy(value));
    },
    async readVersion(key) {
      return values.has(key) ? { value: copy(values.get(key)), etag: versions.get(key) } : null;
    },
    async writeVersion(key, value, etag = null) {
      if (etag === null ? values.has(key) : !values.has(key) || versions.get(key) !== etag) throw conflict();
      const nextTag = String(++sequence);
      values.set(key, copy(value));
      versions.set(key, nextTag);
      return { etag: nextTag };
    },
  };
  return { store, values, versions };
}
