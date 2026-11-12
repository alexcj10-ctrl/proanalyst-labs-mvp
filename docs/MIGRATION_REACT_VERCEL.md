# React + Vite migration (preview branch)

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
| `POST /login` | Explicit unavailable state; no password form or client secret |
| `POST /feedback` | Explicit unavailable state; notes/ratings are never sent or reported saved |
| `POST /scenario-requests` | Explicit unavailable state; requests are never reported saved |
| `GET /insights` (staff API, no existing React screen) | Reserved server capability, unavailable |
| Health and debug endpoints | No frontend dependency; retained in legacy backend |

`web/src/services/server.js` defines the future same-origin endpoint contracts and
their disabled capability status. No API calls are currently made by the app.
The demo entry state is intentionally not staff authentication. Existing history
and favorites keep their v1.1 storage keys and scenario IDs; reloading requires
Enter Demo but does not erase them. The intro-seen flag remains session-scoped.

## Media and interface

`backend/videos/` and all legacy backend/deployment files are retained. The 24
tactical MP4 files are not copied into `web/public` or the build. Until a media
host is configured, tactical details, comparison, library and saved analyses work,
with a clear **Video not connected** state. Missing catalog combinations have a
separate **Not catalogued yet** state. A playback error retains tactical details.

Set `VITE_MEDIA_BASE_URL` to a public HTTP(S) media directory only after media
hosting has been decided. Filenames must remain exactly those in the catalog.
The host must support MP4 playback and byte-range requests. Never put credentials
or signed access tokens in this build-time variable. If videos need protection,
implement a server-issued short-lived media URL flow instead of a public base.
The old job-scoped `/video/` endpoint cannot be used as this base URL.

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
public assets, unavailable server actions and mobile overflow, with no API calls.

## Vercel preparation — no deployment performed

Use `web` as the Vercel project's Root Directory. `web/vercel.json` selects Vite,
`npm run build`, and `dist`. Build uses the committed JSON; it does not regenerate
it and does not require Python. Verify export parity before merging changes.
Remove obsolete `VITE_API_URL` from the eventual preview configuration; React no
longer reads it. Do not change production settings or disable Render during review.

Official references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
and [Vercel Functions](https://vercel.com/docs/functions/quickstart).

## Subsequent server implementation

Place future Functions under `web/api/`, keeping frontend assets independent:

| Endpoint | Contract and requirement before activation |
| --- | --- |
| `POST /api/login` | Server authentication provider or verified password hashes; secure HttpOnly session cookie; no browser-stored JWT; rate limiting |
| `POST /api/feedback` | Validate known scenario ID, boolean `useful`, note <=1200 chars; durable database write before acknowledging success |
| `POST /api/scenario-requests` | Validate phase/shapes, note <=800 chars; durable database write before acknowledging success |
| `GET /api/insights` | Server-enforced staff role; aggregate durable records; never rely on a client-side flag |

Use server-only environment variables for credentials, session signing and database
access (never `VITE_*`). Add origin/CSRF checks for cookie-authenticated writes,
rate limits for public demo submissions, request validation and explicit error
responses. Do not port the local JSONL event file to a Function filesystem.
Wire real response validation into the client only when the respective service is
implemented and tested. Until then the capability remains unavailable, with no
success simulation, local submission queue or fabricated insights.

Next: provision media hosting without moving files into the frontend, implement
server capabilities separately, validate playback/seek and persistence on an
isolated Vercel preview, then review a production cutover. Legacy rollback remains
possible because backend and deployment configuration have not been deleted.

## Verification result (12 November 2026)

- Export parity check: passed; all fields preserved, exactly 24 scenarios.
- Python: 5 tests passed, including exact mapping and video inventory.
- JavaScript: 4 tests passed, including unavailable variants and media configuration.
- ESLint: passed without errors or warnings.
- Vite production build: passed (Vite 7.3.8).
- Chrome end-to-end: 2 tests passed, covering desktop and 390px mobile flows.
- npm audit: 0 vulnerabilities after compatible lockfile updates (no forced major upgrades).
- Backend implementation, tactical video files, public assets, App.css and Render
  configuration unchanged. No production deployment performed.
- Remote tactical video playback and real server persistence are not verified or
  operational: they require the follow-up hosting and Functions work described above.
