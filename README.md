# InsightFlow

Customer-feedback intelligence for Build Battle 2026. InsightFlow turns raw reviews, surveys, and support messages into evidence-backed priorities: duplicate-aware metrics, sentiment and topic analysis, transparent issue scoring, tracked issues, and printable reports with CSV exports.

Every figure in the product is computed from stored records. No fake metrics, no invented trends.

## MERN stack (current)

The app runs as two packages: `frontend/` (React + Vite + TypeScript, port 5173) and `backend/` (Express + TypeScript + Mongoose, port 5000). The UI is unchanged.

```bash
cd insightflow
npm --prefix backend install
npm --prefix frontend install
cp backend/.env.example backend/.env     # set MONGODB_URI (required)
cp frontend/.env.example frontend/.env   # VITE_API_URL, default http://localhost:5000
# migrate existing SQLite records into MongoDB (repeatable, never modifies SQLite):
npm run migrate -- --sqlite ./data/insightflow.db
npm run dev:backend    # http://localhost:5000
npm run dev:frontend   # http://localhost:5173
```

Useful scripts (root forwards to the MERN packages):

| Command            | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `npm run dev:backend` / `dev:frontend` | Dev servers for each package      |
| `npm run build:mern` | Production builds (backend `tsc`, frontend `tsc` + Vite) |
| `npm run test:mern` | Backend + frontend Vitest suites                |
| `npm run migrate`  | SQLite → MongoDB migration (`--sqlite <path>`)       |
| `npm run backup`   | Read-only SQLite backup into `backups/` (git-ignored) |

## Authentication

Session-cookie login with HttpOnly cookies, per-session CSRF tokens, bcrypt password hashing, login rate limiting with account lockout, and administrator-only destructive operations. A passwordless **Try Live Demo** entry signs visitors into a shared read-only demo account: demo sessions can read everything but every write is rejected server-side (403). Create the first admin with `npm --prefix backend run create-admin`. Server secrets live only in `backend/.env` (git-ignored, see `backend/.env.example`); the frontend uses only `VITE_API_URL`, never secrets.

## Configuration

Copy `backend/.env.example` to `backend/.env` (never commit `.env`); optionally copy `frontend/.env.example` to `frontend/.env` to override `VITE_API_URL`.

| Variable             | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | Enables the `gpt-4o-mini` sentiment/topic classifier. Without it, the clearly labeled deterministic rules engine is used. |
| `ADAPTION_API_KEY`   | Enables live Adaption Adaptive Data calls. Without it, the clearly labeled local preparation adapter runs the same documented steps offline. |
| `ADAPTION_BASE_URL`  | Adaption REST base URL. Default `https://api.adaptionlabs.ai`.          |
| `INSIGHTFLOW_DB_PATH`| SQLite source path for one-off migration (`npm run migrate -- --sqlite <path>`). Read-only; migration never modifies SQLite. |
| `MONGODB_URI`        | **Backend (required).** MongoDB connection string, server-side only. Never exposed to the browser. |
| `FRONTEND_ORIGIN`    | **Backend.** Allowed browser origin(s) for CORS, comma-separated. Default `http://localhost:5173`. |
| `PORT`               | **Backend.** Default `5000`. |
| `VITE_API_URL`       | **Frontend.** Express base URL. Default `http://localhost:5000`. No secrets in `VITE_*` vars. |

No key is ever sent to the browser, logged, or included in API responses. Settings shows presence only.

## Architecture

- **MERN:** `frontend/` React 19 + Vite + React Router + Tailwind v4 + Recharts + Lucide (same UI, same styles); `backend/` Express 5 + TypeScript + Mongoose, routes/controllers/services/models/middleware under `backend/src/`; MongoDB collections `feedbacks`, `importrecords`, `issues`, `analysisruns`, `adaptionruns` with schema validation, indexes, and `sqliteId` idempotency keys for the SQLite migration (`backend/src/scripts/migrate-sqlite.ts`, verified 7,001/7,001 feedback records, retry-safe).
- **Auth:** server-managed sessions in MongoDB, HttpOnly cookies, per-session CSRF tokens, bcrypt hashing, login rate limiting with lockout, admin-only destructive operations, and a read-only demo account behind `POST /api/auth/demo` (see Authentication above).
- **Storage:** MongoDB is the live store. The original SQLite database (`data/`, git-ignored) is preserved as the migration source and backup; `scripts/backup.mjs` (`npm run backup`) snapshots it read-only.

## Data honesty rules (enforced in code and UI)

- Original records are never deleted by imports; duplicates are counted and inspectable.
- Sentiment is analyzed, never assumed; the method is stored on every row.
- Source categories are preserved as-is, not presented as AI output.
- No timestamps exist in the source, so no time-series charts are shown; the limitation is stated wherever relevant.
- No customer names, IDs, ratings, dates, or locations are stored or displayed.
- No confidence percentages are fabricated; only provider-returned labels are kept.

## Deployment

MERN deployment (frontend and backend hosted separately; Vercel-style static hosts suit the frontend, a persistent Node host suits the backend — do not assume one serverless host fits both):

- **Database:** MongoDB Atlas or self-hosted; set backend `MONGODB_URI`. Run `npm run migrate -- --sqlite <sqlite-path>` once against the production database (upserts on `sqliteId`, safe to retry).
- **Backend:** `npm run build:mern`, serve `backend/dist` with `node`; set `MONGODB_URI`, `FRONTEND_ORIGIN` (production frontend URL), `OPENAI_API_KEY` / `ADAPTION_API_KEY` in the host dashboard, never in the repo. Health check: `GET /api/health`. Current production (Render): `FRONTEND_ORIGIN=https://build-battle-frontend.vercel.app`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `NODE_ENV=production`. Append preview URLs comma-separated when needed: `FRONTEND_ORIGIN=https://build-battle-frontend.vercel.app,https://<preview>.vercel.app`.
- **Frontend:** static build from `frontend/dist`; set `VITE_API_URL` to the backend URL at build time. `VITE_*` values bake in at build time, so redeploy after changing them. Current production (Vercel): `VITE_API_URL=https://build-battle-8mqs.onrender.com`.
- **Custom domain:** point DNS to the hosts and attach the domain in the host dashboards; domain connection is a manual step (see DEMO.md launch checklist).
- **Cross-site cookies:** the frontend and backend live on different hosts, so the backend needs `FRONTEND_ORIGIN=<public frontend URL>`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true` (both hosts serve HTTPS).

## Security notes

- Session-cookie authentication with HttpOnly cookies, per-session CSRF tokens, and server-side role checks on every request. Demo sessions are read-only server-side (see Authentication above).
- MERN hardening: explicit CORS allowlist (`FRONTEND_ORIGIN`), Helmet security headers with CSP on the API, rate limits on sensitive/expensive endpoints, login rate limiting with account lockout, zod-validated inputs with NoSQL-injection-safe query construction, 1 MB JSON / 8 MB CSV upload limits, formula-injection-guarded CSV exports, typed `DELETE ALL DATA` confirmation for destructive operations.
- Headers set on all API routes: strict CSP, `nosniff`, `SAMEORIGIN` framing, strict referrer policy, minimal permissions policy, HSTS.
- Rate limits: login 20/min, demo entry 10/min, analysis 5/min, imports 10/min, submissions 30/min, data delete 5/min (in-memory, per process).
- All write inputs validated server-side with zod; malformed JSON returns 400, never stack traces; 5xx responses are generic.
- `npm audit --omit=dev` (Oct 2026): 0 vulnerabilities in both MERN packages.
- Legal pages (`/privacy`, `/terms`) describe actual handling and are marked as drafts needing counsel review.

## Limitations

- OpenAI classification needs API credits; without them the rules engine applies (labeled everywhere).
- Live Adaption needs an API key; without it the local adapter applies (labeled everywhere).
- Duplicate folding is exact-match on normalized text; paraphrases count separately.
- Estimated business impact (revenue, churn) is deliberately not computed; the data cannot support it.
