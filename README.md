# InsightFlow

Customer-feedback intelligence for Build Battle 2026. InsightFlow turns raw reviews, surveys, and support messages into evidence-backed priorities: duplicate-aware metrics, sentiment and topic analysis, transparent issue scoring, tracked issues, and printable reports with CSV exports.

Every figure in the product is computed from stored records. No fake metrics, no invented trends.

## Quick start

Requirements: Node.js 20 or later, npm.

```bash
cd insightflow
npm install
cp .env.example .env   # then fill in keys you have; all are optional
npm run dev            # http://localhost:3000
```

Load data: open the app, choose **Load 500-row sample** or **Load full dataset (7,000)** on the empty-state card, or import your own CSV in **Feedback**. Then press **Run analysis** in **AI Insights**.

Useful scripts:

| Command        | Purpose                                    |
| -------------- | ------------------------------------------ |
| `npm run dev`  | Development server                         |
| `npm run build`| Production build (also type-checks)        |
| `npm run start`| Serve the production build                 |
| `npm run lint` | ESLint                                     |
| `npm test`     | Vitest suite (32 tests: parsing, AI rules, pipeline, rate limits) |

## Configuration

All variables are optional and server-side only. Copy `.env.example` to `.env`; never commit `.env`.

| Variable             | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | Enables the `gpt-4o-mini` sentiment/topic classifier. Without it, the clearly labeled deterministic rules engine is used. |
| `ADAPTION_API_KEY`   | Enables live Adaption Adaptive Data calls. Without it, the clearly labeled local preparation adapter runs the same documented steps offline. |
| `ADAPTION_BASE_URL`  | Adaption REST base URL. Default `https://api.adaptionlabs.ai`.          |
| `INSIGHTFLOW_DB_PATH`| SQLite file path. Default `./data/insightflow.db` (git-ignored).       |

No key is ever sent to the browser, logged, or included in API responses. Settings shows presence only.

## Architecture

- **Framework:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Recharts, Lucide icons.
- **Storage:** SQLite via `better-sqlite3` (WAL mode). Tables: `feedback` (original text always preserved), `imports`, `issues`, `analysis_runs`, `adaption_runs`. No ORM; parameterized queries throughout.
- **Analysis pipeline** (`src/lib/ai/pipeline.ts`):
  1. Adaption preparation: column mapping to a universal classification prompt, prompt deduplication, quality evaluation.
  2. Each **unique** pattern classified once (OpenAI batch of 25, or deterministic keyword rules), then fanned out to every duplicate row. Provider failures fall back per item and are recorded with the exact error.
  3. Issues regenerated from stored rows with a documented score: 45% relative frequency + 35% negative share + 20% topic severity. Issue statuses persist across re-runs by title.
- **Adaption integration** (`src/lib/adaption/`): follows the documented Adaptive Data workflow (column roles, prompt deduplication, quality evaluation). `GET /api/adaption` reports mode honestly; `POST {action: test}` verifies the live API before it is trusted.
- **API:** thin validated route handlers under `src/app/api/`. CSV import caps at 8 MB / 20,000 rows with per-row errors. Exports guard against spreadsheet formula injection. Expensive endpoints are rate limited per client.

## Data honesty rules (enforced in code and UI)

- Original records are never deleted by imports; duplicates are counted and inspectable.
- Sentiment is analyzed, never assumed; the method is stored on every row.
- Source categories are preserved as-is, not presented as AI output.
- No timestamps exist in the source, so no time-series charts are shown; the limitation is stated wherever relevant.
- No customer names, IDs, ratings, dates, or locations are stored or displayed.
- No confidence percentages are fabricated; only provider-returned labels are kept.

## Deployment

Any Node host works (`npm run build && npm run start`). Notes:

- **Persistence:** the SQLite file lives at `INSIGHTFLOW_DB_PATH`. On ephemeral hosts (serverless) use a persistent volume or set the path accordingly, otherwise data resets on redeploy.
- **Environment:** set `OPENAI_API_KEY` / `ADAPTION_API_KEY` in the host dashboard, never in the repo.
- **Custom domain:** point DNS to the host and attach the domain in the host dashboard; the app needs no code change. Domain connection is a manual step (see DEMO.md launch checklist).

## Security notes

- Same-origin app; no CORS, no cookies, no sessions. There is no login system by design (single-workspace demo); protect private deployments with host-level access control.
- Headers set on all routes: CSP (scripts same-origin only), `nosniff`, `SAMEORIGIN` framing, strict referrer policy, minimal permissions policy, HSTS.
- Rate limits: analysis 5/min, imports 10/min, submissions 30/min, data delete 5/min (in-memory, per process).
- All write inputs validated server-side with zod; SQL uses bound parameters; CSV export neutralizes formula injection; malformed JSON returns 400, never stack traces.
- `npm audit` (Oct 2026): 5 high findings, all confined to the local-only ESLint toolchain (`eslint-config-next` line, no patched release available). No production dependency is affected.
- Legal pages (`/privacy`, `/terms`) describe actual handling and are marked as drafts needing counsel review.

## Limitations

- OpenAI classification needs API credits; without them the rules engine applies (labeled everywhere).
- Live Adaption needs an API key; without it the local adapter applies (labeled everywhere).
- Duplicate folding is exact-match on normalized text; paraphrases count separately.
- Estimated business impact (revenue, churn) is deliberately not computed; the data cannot support it.
