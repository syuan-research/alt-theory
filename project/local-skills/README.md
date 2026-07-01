# Local Dev Skills

Project-scoped skills for development harnesses. These folders are **not**
loaded by the Alt Theory runtime (`ALT_THEORY_RESOURCE_DISCOVERY=internal`
reads only `agent-assets/skills/`).

Current layout:

```text
project/local-skills/
  cs-swe-v0-4/              # active SWE-only CodeStable-derived bundle
  model-preset-maintenance/ # dev/release model preset maintenance
```

Historical CS-SWE shards live in local ignored snapshots:

```text
_archives/skills/
```

Pilot/runtime surface keeps only `agent-assets/skills/conversation-summary/`.