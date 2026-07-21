# Public Current-Tree Candidate

Status: local review candidate; not published; history not rewritten.

## Cleanup Applied

- Removed tracked `notes-and-status/`, `output/`, `project/cross-workstream/`,
  `project/brainstorms/`, legacy process rules, local migration/reference
  indexes, three internal machine/process policies, and a Windows shortcut.
- Replaced remaining real local workspace paths with repository variables or
  public upstream URLs.
- Kept application code, tests, architecture, product spec, public agent
  assets/instructions, user guides, feature design/acceptance records, and
  public-safe historical material.
- Removed the Git remote from this local candidate.

## Verification

- High-confidence current-tree secret scan: no matches.
- Real private-path scan: no matches after replacements. The literal
  `C:\Users\` remaining in `AGENTS.md` is a safety-pattern example, not a real
  user path.
- Participant/session data-file scan: no candidates.
- Backend tests: 108 passed, 0 failed.
- Frontend production build: passed.

## Short Review List

These are retained because they are public-safe and do not block this
candidate, but their long-term public value is not yet decided:

1. `project/compound/` research, decisions, and explorations.
2. `project/architecture/archive/` and `project/foundation/origin/` historical
   material.
3. `project/local-skills/` and current repo instructions still describe the
   former private process-record layout; keep for now, simplify before public
   contributor use if needed.

## Separate Preservation Hold

The source integration tree contains ignored local data, including `runs/` and
`_archives/`, that is not part of this candidate and may have no other copy.
A private workspace-level preservation hold records this inventory. Do not
delete or move the source tree without a verified private archive and explicit
user approval.
