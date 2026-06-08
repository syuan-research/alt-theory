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

Browser click/visual verification was not automated because the project has no
Playwright/puppeteer dependency. The local server is left running for user or
external-agent verification.

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

No new attention candidate. The only verification caveat is one-off: browser
click automation is not present in this repo.

## 9. Leftovers

- User or external OpenCode/Hermes agent should verify actual browser
  click-through: select session, inspect detail, Resume/Open, confirm runtime
  inspector changes.
- Live provider prompt after resume remains deferred.
- Tags, annotations, comparison, and export remain future work.

