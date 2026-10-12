# InsightFlow demo script (about 6 minutes)

Setup (MERN): start MongoDB, run `npm run migrate -- --sqlite ./data/insightflow.db` once, then `npm run dev:backend` (http://localhost:5000) and `npm run dev:frontend` (http://localhost:5173). Open the frontend, load the full official dataset in Feedback, run deterministic analysis in AI Insights. Keep Settings open in a second tab for the integration questions.

## The flow

1. **Overview (30s).** "7,000 records, but only 317 unique patterns. 6,683 duplicates are preserved and flagged, not deleted." Click the negative stat card to jump into filtered feedback.
2. **Import (30s).** In Feedback, show the import summary style: imported, duplicates, errors. Upload a two-line CSV live, or point at Import history in Settings.
3. **Data quality (45s).** AI Insights, Adaption panel: "Every analysis starts with preparation. Reviews map to a universal classification prompt, duplicates fold away, and we get a quality grade. Without an Adaption key this runs in the local adapter, and the UI says so."
4. **Analysis (45s).** Press Run analysis (deterministic). "317 unique patterns classified once, fanned out to 7,000 rows. No confidence scores are invented."
5. **Sentiment and topics (60s).** "3,517 negative, 2,320 neutral, 1,163 positive, all predictions, all clickable." Open the fraud topic to its records.
6. **Duplicate groups (30s).** "The top pattern repeats 295 times. Volume is real; distinct complaints are fewer, and the product says that."
7. **Priority issue (60s).** Open "Fraud and scams in Fraud and Scam", score 100. Read the scoring explanation aloud: 45% frequency, 35% negative share, 20% severity. Show the recommendation and the three evidence records.
8. **Tracking (30s).** Flip the issue to In progress. Re-run analysis later and the status survives; IDs regenerate but titles preserve state.
9. **Reports (45s).** Download the issues CSV, then Print to show the clean handout with the Limitations section. "No public share links, because reports can contain private feedback."
10. **Adaption explanation (45s).** "Adaption contributes the preparation step: column mapping, prompt deduplication, quality evaluation. What was sent, what came back, and how it fed classification is on screen. Live mode needs a key; the Test button verifies it instead of assuming."

## If asked about AI

- Provider architecture: OpenAI `gpt-4o-mini` in batches of 25 when a key with credits exists; otherwise deterministic keyword rules over a shared taxonomy. Every row stores its method.
- Current environment: the configured OpenAI key has exhausted credits, so runs fall back per item and record the exact provider error. Adding credits switches the live path on with no code change.
- Live Adaption: needs `ADAPTION_API_KEY`; the local adapter mirrors the documented steps until then.

## Launch checklist (manual steps)

- [ ] Deploy hosts chosen (static frontend + Node backend), `VITE_API_URL` (frontend build) and `MONGODB_URI` + `FRONTEND_ORIGIN` (backend) set in host env.
- [ ] `OPENAI_API_KEY` and `ADAPTION_API_KEY` set in backend host env.
- [ ] Production migration run once against the production database (`npm run migrate -- --sqlite <path>`, counts verified).
- [ ] Custom domain DNS pointed and attached in host dashboard.
- [ ] Privacy/Terms reviewed by counsel before production use.
- [ ] If the deployment is public: add host-level access control or approve a real auth design — the optional API token alone is not a complete authentication system.
