# Experimental assets (local only)

Contents under this tree are for **owner/dev testing**. Electron-builder
excludes `agent-assets/experimental/**` from packaged builds.

When this folder exists on disk, **Alt Theory always scans it** (same run as
bundled assets). **Pack omit is intentional** (friends/installers do not get
experiments). **Runtime always includes** experimental when present — not
optional, not “default off”.

| Path | Scanned by | Usable for |
|------|------------|------------|
| `role-presets/` | `listRolePresets` + `resolveRolePresetSlug` → `/api/role-presets` | Role picker / session role load |
| `skills/` | `listAltTheorySkills` → `/api/skills` (UI discovery), Settings `discoverSkillResources`, **and** session load + manifest | Slash/toolbox + in-conversation skills |
| `kb/` | `listKbDomains` (duplicate `ep-core-v0-2-0` skipped if `ep-core` exists) | Optional domains |

Sources are **copied** from the research tree when promoted for testing — do
not treat this folder as the authoring source of truth.

Current probe (2026-07-28/29 research):

- Role: `role-presets/role-theory-innovation-companion-v0.md` (+ stance block)
- Skill: `skills/theory-innovation-loop/SKILL.md` (`name` + `description` required)
- Notes: `README-theory-innovation-20260728.md`
