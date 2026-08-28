# ProAnalyst Labs Web v1.1

React + Vite frontend for the ProAnalyst Labs Tactical Intelligence Platform.

## Development

```bash
npm install
npm run dev
```

Create `.env` from `.env.example` and set:

```env
VITE_API_URL=http://localhost:8000
```

## Production (Vercel)

Set `VITE_API_URL` to the deployed Render/FastAPI URL in the Vercel project environment, then deploy the `web` directory.

The UI includes:

- one-click demo access
- tactical phase roadmap
- visual formation selection
- solution A/B comparison
- protected video result + tactical explanation
- searchable video library
- local history and favorites
- missing scenario requests
- coach feedback
- separate Club Methodology roadmap area
