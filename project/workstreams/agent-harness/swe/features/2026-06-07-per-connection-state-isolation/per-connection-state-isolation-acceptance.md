# Per-Connection State Isolation Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-07

## 1. Interface Contract Verification

- [x] One `ConnectionState` owns each Pi session and subscription.
- [x] Profile selection uses `profileSlug`; KB selection uses validated domains.
- [x] Connect, replace, and close lifecycle paths share explicit helpers.

## 2. Behavior And Decision Verification

- [x] No mutable global session selection state remains.
- [x] `new_session` disposes only the initiating connection's session.
- [x] Unknown slugs return an error and do not mutate state.

## 3. Acceptance Scenario Verification

The two-client integration test produced distinct IDs, retained `all` only on
client one, retained `ep-core` on client two, and replaced both independently.

## 4. Terminology Consistency

Protocol and server consistently use `profileSlug` and `currentDomain`.

## 5. Architecture Merge

Deferred to whole-plan acceptance.

## 6. Requirement Writeback

No separate requirement record.

## 7. SWE-Plan Writeback

F3 is marked done; F6 is now unblocked.

## 8. Attention Candidate Review

No new candidate.

## 9. Leftovers

Reconnect/resume remains out of scope.
