# GitHub / Deployment handoff — ProAnalyst Labs v1.1

This package is prepared as a replacement/update of the existing ProAnalyst Labs MVP repository.

## What to upload

Upload the **contents of the repository folder**, not the ZIP file as a single repository asset. The ZIP is only the transport package.

The repository already excludes generated/local content such as `node_modules`, `dist`, `.env`, virtual environments and Python caches.

## Recommended update flow

1. Extract the ZIP locally.
2. Open the extracted `proanalyst-labs-v1.1` folder.
3. Replace/update the files in the existing GitHub repository with these contents.
4. Commit the update, for example: `ProAnalyst Labs v1.1 tactical intelligence workspace`.
5. Push to the branch connected to Vercel/Render.
6. Confirm the production environment variables below.

## Render backend environment

Required for production:

- `SECRET_KEY` — long random secret.
- `STAFF_USER` — staff username.
- `STAFF_PASS` — strong staff password.
- `ALLOWED_ORIGINS` — include the production Vercel origin.
- `ENABLE_DEBUG_ENDPOINTS=false` — keep debug routes off in normal production.

The public demo uses `/demo-login` and does not expose staff credentials.

## Vercel frontend environment

Set:

```env
VITE_API_URL=https://<your-render-backend>.onrender.com
```

Deploy the `web` directory as the Vite frontend, as in the current project.

## Post-deploy smoke check

- Open the app and choose **Enter Demo**.
- Confirm the catalog reports 24 validated scenarios.
- Run `Build Up → 4-3-3 vs 4-2-3-1 → Solution A`.
- Confirm the protected video loads and the tactical detail appears.
- Open **Video Library** and search for `third man`.
- Save an analysis and confirm it appears in **My Analyses**.
- Select a non-catalogued matchup and submit **Request this analysis**.
- Submit useful/not-useful feedback on a result.

## Intentional v1.1 boundaries

- The current tactical layer remains deterministic; it does not claim to be generative AI.
- Feedback and missing-scenario requests are MVP telemetry, not a durable production database yet.
- Favorites/history remain local to the browser.
- Motor IA v1 is the next structured engine layer, not silently simulated in this release.
