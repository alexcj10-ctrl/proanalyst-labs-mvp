# ProAnalyst Labs v1.1 — Current Architecture

## Product principle

ProAnalyst Labs should answer a coaching problem, not merely retrieve a video file.

The deterministic MVP therefore uses this flow:

**Game phase → Our structure → Opponent structure → Available solution → Tactical explanation + protected video → Save / feedback**

## Layer 1 — Deterministic tactical catalog (current)

`backend/sequences.py` is the source of truth for the current validated scenarios. Each entry contains:

- phase
- own structure
- opponent structure
- solution variant
- video filename
- tactical title
- objective
- principles
- key actions
- risk notes
- coaching points
- qualitative profile (risk, verticality, tempo)

This lets the product represent tactical knowledge rather than only a filename mapping.

## Layer 2 — Product learning (current MVP)

Two lightweight workflows collect demand signals:

1. **Scenario requests** when a selected matchup is not yet catalogued.
2. **Coach feedback** after a tactical result.

The current telemetry is deliberately simple and not a replacement for a durable database. For production analytics, connect these endpoints to a persistent store.

## Layer 3 — Motor IA v1 (next)

The next engine should remain separate from the deterministic catalog and accept structured inputs such as:

- `our_shape`
- `opp_shape`
- `phase`
- `press_intensity`
- `ball_zone` (24-zone model)
- optional minizone (96-point model)
- tactical constraints

Target structured outputs:

- intent
- `positions_by_role`
- key actions
- validation checks (superiority, +1, density, occupation)
- risk notes
- alternative solutions

First output should be text + 2D tactical board. Dynamic 3D generation should only be added after the tactical engine is reliable.

## Line B — Club Methodology

Club Methodology is intentionally a separate environment. ProAnalyst is the platform; each club defines its own methodology.

Future entities:

- Game Model
- Principles
- Age Groups
- Training Sessions
- Video Examples
- Player Development

AI should later operate on the same club-defined structure, not replace it with a universal ProAnalyst methodology.

## Security changes in v1.1

- Public `/videos` static mounting removed.
- Video playback remains token-protected and job-scoped.
- One-click demo receives a dedicated demo JWT.
- Staff login remains environment-configurable.
- No fixed production JWT secret is committed.
- Debug routes are disabled by default and authenticated when enabled.
- API payloads use Pydantic models instead of arbitrary dictionaries.
