# Bundle Verification Workstream

This workstream owns the pragmatic v0.5.x local Windows folder bundle path for
Alt Theory. Historical Electron feasibility records remain here, but the current
shipping target is the `dist/win-unpacked` folder app built from
`dev/worktrees/llm-theo-v0.3-dev`.

## Current Entry Points

- Current status: `notes-and-status/STATUS.md`
- Agent guidance: `agent-guidance-v0-5x-bundle.md`
- Chinese user guide: `user-guide-v0-5x-local-bundle.zh.md`
- English user guide: `user-guide-v0-5x-local-bundle.en.md`
- Latest zip release note: `release-notes/2026-06-28-alt-theory-win-protable.md`
- Current architecture: `project/architecture/local-windows-bundle.md`
- Current provider/config decision:
  `project/compound/research-provider-model-ux/2026-06-26-decision-v0-5-local-config-and-bundle-path.md`

## Current Target

```text
build:  npm run build:electron
output: dist/win-unpacked/
launch: dist/win-unpacked/AltTheory.exe
```

The older zcode bundle lane and Candidate B / portable repair are historical or
probe material unless the user explicitly reopens them.

## Key Boundary

Do not conflate the VPS/hosted surface with the local Windows bundle surface.
The local bundle serves `public-v6`; the hosted/VPS default may still use the
older `public/` static surface unless deployment explicitly overrides it.
Therefore old `public/config.html` is retained and must not be deleted as a
bundle cleanup shortcut.
