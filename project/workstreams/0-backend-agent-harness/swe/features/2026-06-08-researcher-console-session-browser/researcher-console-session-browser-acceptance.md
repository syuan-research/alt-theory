# Researcher Console Session Browser Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-08
> Associated design doc: `researcher-console-session-browser-design.md`

## 1. Interface Contract Verification

- [x] Left panel now has session list, detail/preview, refresh, and Resume/Open
  controls.
- [x] Frontend calls `GET /api/sessions` and
  `GET /api/sessions/{sessionId}`.
- [x] Resume/Open sends WebSocket `open_session`.

## 2. Behavior And Decision Verification

The UI remains the existing vanilla three-area console. It adds session browser
state and rendering without tags, annotations, export, comparison, asset
editing, provider/auth UI, or live prompt behavior.

## 3. Acceptance Scenario Verification

Evidence:

- `node --check alt-theory-app/web-server/public/client.js` passed.
- `npm run test:backend` passed and covers backend `open_session`.
- Local server smoke at `http://127.0.0.1:43125/` verified:
  - HTML includes `session-browser-section`;
  - served `client.js` includes `fetchSessions`, `open_session`, and
    `resumeSessionBtn`;
  - `GET /api/sessions` and `GET /api/sessions/{sessionId}` respond.
- Headed Chromium 1224 click-through on 2026-06-09
  (driver and evidence under
  `project/workstreams/0-backend-agent-harness/output/20260609-console-browser-cdp/`):
  - Page loaded, WebSocket connected, server opened an
    initial session (`MiniMax-M3` on `minimaxi-cn-anthropic`),
    session list populated with 10 rows.
  - Selected the `available` historical session
    `1cf4101b-ce36-4a3f-8bd1-e757c0ed2d20` (8 turns, no
    warnings).
  - `#session-detail` rendered the full session preview
    (id, updated, KB, role, model, turns, message count,
    transcript preview).
  - `#resume-session-btn` was enabled and was clicked.
  - WebSocket `open_session` was sent; server emitted
    `[ws] Session opened: 1cf4101b-…` and `#session-status`
    flipped to `Ready`; chat header reflected the new
    active session id.
  - Screenshots:
    `01-loaded.png`, `02-session-list.png`,
    `03-detail.png`, `04-after-resume.png`.
  - DOM and console log: `logs/log.json` and
    `logs/dom-states.json`.
- Stage 1.1 multi-turn live UAT probe on 2026-06-09
  (evidence under
  `project/workstreams/0-backend-agent-harness/output/20260609-console-browser-cdp/`):
  - Ran on top of the resumed `1cf4101b-...` session.
  - P1 identity prompt completed in about 7 seconds.
  - P2 KB prompt completed in about 65 seconds and produced visible
    tool-status bubbles for KB lookup.
  - P3 replayed the real prior user prompt and hit the 90-second driver cap
    while still running/reading the KB. This is recorded as long-turn UAT
    evidence, not an app-code failure.
  - Captured 11 screenshots plus `logs-1.1/log.json` and
    `logs-1.1/results.json`.

## 4. Terminology Consistency

The UI uses "Sessions" and "Resume / Open". It does not reintroduce profile
terminology.

## 5. Architecture Merge

`project/architecture/researcher-console.md` now records historical session
list/detail and WebSocket resume/open as current console behavior.

## 6. Requirement Writeback

No separate requirement record.

## 7. SWE-Plan Writeback

`researcher-console-session-browser` is marked done and the
`session-list-resume-open` SWE-plan is marked completed.

## 8. Attention Candidate Review

No new feature-code attention candidate from the 2026-06-09 browser pass.
The earlier "browser click automation is not present in this
repo" caveat is **closed** by the headed Chromium click-through
captured in §3. The driver lives outside the repo (in a
workstream-local `output/` directory) and is intentionally
not promoted to a tracked module, per the
"don't add Playwright as a project dependency" decision.

Testing-process learning was promoted to
`project/compound/2026-06-09-learning-backend-test-ladder-and-runtime-env.md`.

## 9. Leftovers

- **Resolved (2026-06-09)**: actual browser click-through
  was performed in headed Chromium 1224; see §3.
- **Partly resolved (2026-06-09)**: live prompts after resume were exercised
  in Stage 1.1. Remaining UAT work is repeatability and long-turn behavior,
  especially a rerun with `ALT_THEORY_KB_DIR` set before server launch if a
  synthetic KB override needs to be tested.
- Tags, annotations, comparison, and export remain future
  work.
