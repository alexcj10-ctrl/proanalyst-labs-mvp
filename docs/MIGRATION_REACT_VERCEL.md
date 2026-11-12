# React + Vite migration (preview branch)

## Completed hosting and Functions — 12 November 2026

The migration is implemented and verified on an isolated preview.

- Existing project: `proanalyst-labs-mvp`, `prj_Mlq2vXazedm3goNlECwBKJhHS9x3`.
  GitHub remains linked, Root Directory `web`, framework Vite, Node 24.
- Public media store: `proanalyst-demo-videos`, `store_2stKkhbsYQ1x19nV` (Frankfurt).
- Private preview data store: `proanalyst-private-preview`, `store_FtoTtXiJtqCrjao2`.
- Both stores use OIDC connections for preview/development only, with no static
  Blob credentials. Hobby plan retained; no paid plan or upgrade activated.
- `web/src/data/media.json` contains 24 actual public Blob URLs, exact filenames,
  SHA-256 digests and byte sizes. `web/scripts/upload-videos.js` uses direct
  multipart upload, content-addressed paths and skips existing matching objects.
  Each upload was checked with HEAD and a 206 byte-range request containing an MP4 header.
- `web/api/[action].js` exposes Node Functions for login, logout, session, feedback,
  scenario-requests and insights. No Python runtime or Render request is used.
- Staff login uses salted scrypt hashes (N=32768), random opaque session tokens,
  private persisted sessions, 8-hour expiry and HttpOnly/Secure/SameSite=Strict
  cookies. Logout revokes the session server-side. Passwords are never bundled.
- Secret credentials are scoped to this migration branch's Preview environment.
  The operator's access file is outside the repository with user-only filesystem
  permissions; no password is printed or committed.
- Feedback and requests use immutable private JSON records, idempotency keys,
  validation, same-origin POST checks and durable atomic rate-limit slots.
  Storage failure returns an error, never a success acknowledgment.
- Insights are authorized server-side and aggregate persisted records. The preview
  acceptance test creates two clearly labelled test records to verify persistence.
- Original backend, video backups, CSS, introduction, logo and whitepaper remain.


### Production readiness

Do not merge automatically. Before release, connect production to the public media
store and a separate private production store, provision server-only staff secrets
for production, and validate a staged deployment. Preview data and credentials
must not be reused as production state. No production environment variables,
domain aliases, or production branch have been changed during this migration.

The accidental `upload-videos` project created by a CLI argument interpretation
was inspected by exact name and deleted with explicit user authorization. It is
unrelated to the ProAnalyst project. No other project was deleted or changed.

## Scope and source of truth

The existing React application is retained. `backend/sequences.py` remains the
authoring source; `scripts/export_catalog.py` imports only that module and exports
the complete `build_catalog()` response to `web/src/data/catalog.json`.
No FastAPI process or Python installation is required to build or run the frontend.
Python is only needed when regenerating or checking the catalog.

The export retains all 24 scenario IDs, 19 build-up and 5 finishing entries,
A/B/FA variants, metadata, aliases, roadmap and exact video filenames. It has no
timestamp, so repeated exports are identical. Do not edit the JSON by hand.

## Dependency inventory and replacement

| Original dependency | Migration |
| --- | --- |
| `POST /demo-login`, demo JWT and localStorage token | Local demo entry, no authentication claim or credentials |
| `GET /catalog` | Bundled JSON, including formations and solution availability |
| `GET /options` (legacy API, unused by current React) | Phases already preserved in JSON |
| `POST /generate` | Exact synchronous lookup of phase + own + opp + variant |
| `GET /status/{job_id}`, in-memory jobs and interval polling | Removed from React |
| `GET /video/{job_id}`, short-lived JWT, byte-range streaming | Separate configurable media host; no legacy fallback |
| `POST /login` | Same-origin Vercel Function with server-only password hash |
| `POST /feedback` | Private persistent Blob records through Vercel Function |
| `POST /scenario-requests` | Private persistent Blob records through Vercel Function |
| `GET /insights` | Staff-only Function and new staff view |
| Health and debug endpoints | No frontend dependency; retained in legacy backend |

`web/src/services/server.js` calls the same-origin Functions for server actions.
Demo entry and deterministic selection require no API call.
The demo entry state is intentionally not staff authentication. Existing history
and favorites keep their v1.1 storage keys and scenario IDs; reloading requires
Enter Demo but does not erase them. The intro-seen flag remains session-scoped.

## Media and interface

`backend/videos/` and all legacy backend/deployment files are retained. The 24
tactical MP4 files are not copied into `web/public` or the build. The committed
manifest maps each scenario to its verified public Blob URL. An optional
`VITE_MEDIA_BASE_URL` can override the media host. Missing catalog combinations
show **Not catalogued yet**; playback failures preserve the tactical details.

Intro video, logo and whitepaper already in `web/public` remain unchanged.
Club Methodology, layout, styles and responsive breakpoints are retained.

## Reproduce validation

From the repository root, using Python 3.10+:

```sh
python scripts/export_catalog.py
python scripts/export_catalog.py --check
python -m unittest backend.test_catalog -v
cd web
npm ci
npm run lint
npm test
npm run build
npm run test:e2e
```

Node 22.12+ or Node 24 is recommended. Browser tests use installed Google Chrome
in headless mode and start/stop their own localhost Vite server. No backend is
started. On a runner without Chrome, install it with `npx playwright install chrome`.
Python tests compare the full JSON object to the Python source, every scenario's
metadata and video mapping, exact count, uniqueness and physical video inventory.
Browser tests exercise demo, intro, default and A/B selections, finishing,
unavailable scenarios, search/filter, history/favorites after reload, methodology,
public assets, honest server errors when unconfigured, and mobile overflow.
`web/scripts/verify-preview.js` additionally tests all 24 real video playback/seek
flows, staff authentication, durable submissions, private insights and logout.

## Deployment and verification result (12 November 2026)

GitHub automatically builds the migration branch on the existing Vercel project.
`web/vercel.json` uses Vite, `npm run build`, and `dist`; Python is not required.
React no longer reads the legacy `VITE_API_URL` setting.

- Export parity: passed; full metadata preserved, exactly 24 scenarios.
- Python: 5 tests passed, including exact mapping and physical video inventory.
- JavaScript: 8 tests passed, including catalog, authentication, persistence,
  idempotency, validation, rate limits and fail-closed storage errors.
- ESLint and Vite production build: passed.
- Chrome end-to-end: 2 tests passed, desktop and 390px mobile flows.
- npm audit: 0 vulnerabilities.
- Live preview: all 24 MP4s played and seeked successfully; unauthorized insights
  and wrong passwords rejected; feedback and scenario requests persisted and
  appeared in staff insights; logout invalidated the session; mobile layout passed.
- Machine-readable live evidence: `web/preview-verification.json`.
- No production deployment or paid upgrade performed. Original backend, video
  backups, App.css and public assets remain intact.

The remaining release step is review and a deliberate production cutover with
separate production staff credentials and private data storage. Legacy rollback
remains possible because backend and deployment configuration were retained.
