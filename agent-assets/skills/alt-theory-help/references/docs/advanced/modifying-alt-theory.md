# Modifying Alt Theory and Its Extension Boundaries

Alt Theory is open source — MIT for the software, CC BY 4.0 for original
documentation and agent assets. You can read, build, and change all of
it. This page is about where the seams are: which changes the design
expects, and which mean you are carrying a fork.

## The seams designed for change

In rough order of how far you are reaching:

1. **Assets** — skills, roles, souls, knowledge bases, instructions
   ([previous page](customization-without-changing.md)). Data, not code;
   upgrade-safe.
2. **Configuration** — providers, models, per-mode skill enablement,
   precedence. Also upgrade-safe.
3. **The Pi ecosystem underneath** — the app embeds the Pi agent runtime,
   so capabilities that exist as Pi ecosystem resources (packages,
   extensions, tools) are the intended route for new agent capabilities —
   build or adopt there rather than teaching the app's core new tricks.
   Two boundaries hold: packages must use the embedded runtime's
   libraries (a package demanding a different Pi core is disabled with a
   visible diagnostic, not silently doubled), and the app's security
   layer stays in the loop — it mediates tool execution regardless of
   which extension provided the tool.
4. **The application itself** — backend, frontend, packaging. Yours to
   change (MIT), with honest consequences: you own the merge with
   upstream movement, which in alpha is fast.

## The extension posture, stated plainly

Two deliberate decisions shape everything above:

- **No ambient extension loading.** The app does not auto-load whatever
  extensions exist in your environment; extensions load only where the
  app explicitly registers them. This is a security and predictability
  decision — a conversation's capabilities are what its configuration
  says, not what happens to be installed on the machine.
- **Trusted-software boundary.** Extensions and tools execute with your
  user's permissions. The policy layer constrains *operations*, but no
  policy makes an untrusted extension safe to install. What you add to
  the runtime, you are trusting — audit accordingly.

## Practical notes for a source build

- The repository README carries current build/test commands
  ([install page](../start-here/install-and-launch.md) has the short
  version).
- The backend test suite and frontend typecheck are the fast honesty
  checks after a change; run them before trusting a modified build with
  real work.
- Architecture documentation lives in the repository under
  `development/architecture/` — written for exactly this reader.

## If you build something

The asset layer is designed to travel (skills especially — they work
across harnesses). If you build a skill, role, or knowledge base with
value beyond your own setup, sharing it costs a folder. For changes to
the product itself, the repository's contribution guidance is the entry
point; an alpha-stage product benefits most from issues that describe
real research use.
