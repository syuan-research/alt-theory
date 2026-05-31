# Agent Profiles

Profiles in this folder describe the agent's runtime stance, not simulated users.

Current decision:

- `default.md` is closer to a lightweight `SOUL.md` than to a student or user persona.
- Simulated user profiles from `_dev/sim-users/` are test assets and should not be used as the default Alt Theory runtime profile.
- Personalized user profiles are not required for v1.

Future alignment:

- `soul.md` should hold durable agent identity and stance.
- `user.md` should hold user context and preferences.
- `memory.md` should hold persistent cross-session working memory.
- Runtime profile injection may later become an adapter over those files.

