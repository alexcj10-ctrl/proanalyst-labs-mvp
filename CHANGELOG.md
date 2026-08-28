# Changelog

## 1.1.0 — Tactical Intelligence Workspace

### Frontend
- Rebuilt the MVP workflow around tactical decisions rather than video selection.
- Added phase roadmap, visual formation selector, solution comparison and rich result view.
- Added Video Library, recent analyses, favorites and Club Methodology roadmap.
- Added missing-scenario request and coach feedback UI.
- Added one-click demo access and once-per-session skippable intro.
- Reworked responsive design system for desktop and mobile.

### Backend
- Added typed Pydantic models for tactical requests, feedback and requests.
- Added tactical metadata to the deterministic catalog.
- Added `/demo-login`, `/scenario-requests`, `/feedback` and `/insights`.
- Protected debug endpoints and disabled them by default.
- Removed public static video mounting.
- Removed fixed source-code JWT secret fallback.
- Kept backward compatibility with the old `press` variant field and catalog alias.

### Architecture
- Added explicit boundary between deterministic v1.1 and future Motor IA v1.
- Documented Club Methodology as a separate Line B workspace.
