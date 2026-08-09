# Native Pi Runtime Mode

Alt Theory is built on the [Pi coding-agent runtime](https://pi.dev) and
adds its own behavior layer on top: roles, the soul, knowledge context,
and the bundled skills and methods. A setting in
[Settings](../system-guide/settings-and-configuration.md) lets you drop
that behavior layer and run the app as an ordinary Pi coding agent.

## What Native Pi is

Switching the agent behavior setting from Alt Theory to Native Pi drops
Alt's roles, soul, and knowledge context, and the app works like a normal
coding agent. File and command safety, and the approval boundaries, are
unchanged. This is a subtractive mode: it removes Alt Theory's additions
and leaves Pi's base capability.

The setting is a runtime selection in Settings, not a separate
installation. Switching reloads the app.

## When to use it

Native Pi is for work that wants Pi's ordinary coding behavior without
Alt Theory's research-oriented framing. If you are mostly coding and want
the agent to act like the underlying Pi runtime, switch to Native Pi. The
configuration boundary between Alt Theory and Pi, and where each setting
lives, is in [Shared Configuration and Assets](shared-configuration-and-assets.md).

## Relation to Understand and Work

Understand and Work are Alt Theory's two modes and only exist within the
Alt Theory behavior layer. Native Pi is a third runtime selection outside
that pair, not a fourth mode alongside them. In Native Pi the
Understand/Work distinction does not apply.

## Skills in Native Pi

Native Pi keeps Pi's own skill discovery. Alt Theory's bundled skills can
still be scanned and used if the matching option is on; otherwise Alt
Theory's skill layer is removed with the rest of the behavior layer. The
precedence and ownership rules in
[Shared Configuration and Assets](shared-configuration-and-assets.md)
apply the same way.
