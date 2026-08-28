# ProAnalyst Labs — Tactical Intelligence Platform

This repository contains the **ProAnalyst Labs v1.1** deterministic MVP.

The product has evolved from a simple tactical video selector into a decision workspace: coaches select a game phase and matchup, then receive a validated 3D scenario together with tactical objective, principles, key actions, risks and coaching points.

## v1.1 highlights

- New premium React workspace with sidebar navigation and responsive mobile layout.
- Visual phase selection and formation cards instead of database-like dropdowns.
- Tactical result page: video + objective + principles + key actions + coaching points + risk notes.
- Solution A/B comparison when both variants exist.
- Tactical Video Library with search and phase filters.
- Local recent-analysis history and favorites.
- Missing-scenario request workflow.
- Coach feedback workflow.
- One-click public demo login without publishing demo credentials in the UI.
- Typed FastAPI request models (Pydantic).
- Video assets are no longer mounted through a public `/videos` static directory.
- Debug endpoints are disabled by default and require **staff** authentication when enabled.
- Rich tactical metadata is now part of the backend catalog.
- Club Methodology is represented as a deliberately separate Line B roadmap area.
- Motor IA v1 is explicitly positioned as the next architecture layer; the current product does **not** pretend to generate tactical solutions with AI yet.

## Repository structure

```text
backend/
  main.py              FastAPI API, auth, protected video delivery, feedback/requests
  sequences.py         deterministic tactical knowledge catalog
  videos/              validated MP4 tactical scenarios
web/
  src/App.jsx           React product experience
  src/App.css           ProAnalyst design system
  public/               logo, intro and whitepaper
docs/
  ARCHITECTURE_V1_1.md  current product architecture and next-step boundaries
render.yaml             Render backend deployment
```

## Local development

### Backend

```bash
cd backend
python -m venv .venv
# Activate the virtual environment, then:
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Copy `backend/.env.example` values into your environment. For production, set a long random `SECRET_KEY` and strong staff credentials.

### Frontend

```bash
cd web
npm install
npm run dev
```

Create `web/.env` with:

```env
VITE_API_URL=http://localhost:8000
```

## Deployment

### Render (backend)

`render.yaml` is configured for the `backend` directory. In the Render service environment, configure at minimum:

- `SECRET_KEY`
- `STAFF_USER`
- `STAFF_PASS` (staff login stays disabled if staff credentials are not configured)
- `ALLOWED_ORIGINS` (include the production Vercel URL)
- `ENABLE_DEBUG_ENDPOINTS=false`

### Vercel (frontend)

Set:

```env
VITE_API_URL=https://<your-render-service>.onrender.com
```

Then deploy the `web` project as the Vite frontend.

## Important MVP limitations

- Jobs are stored in process memory. A server restart clears active job records.
- Feedback/request analytics are runtime MVP telemetry and are not a durable database yet.
- History and favorites are currently stored in the browser's local storage.
- Tactical metadata describes the deterministic video catalog; there is no generative tactical AI in v1.1.

These boundaries are intentional. The next major layer is **Motor IA v1**, which can introduce structured inputs such as press intensity, ball zone/minizone, constraints and role positions before any future dynamic 3D generation.

## Repository checks

A lightweight catalog integrity suite is included:

```bash
python -m unittest backend.test_catalog -v
```

It verifies that every catalog entry has tactical metadata, every referenced MP4 exists, and no tactical MP4 is left unreferenced. See `GITHUB_DEPLOY.md` for the deployment handoff checklist.
