# Setup procedure

Use this when the user wants Helper to perform setup, not merely explain it,
and the conversation can act.

1. Read the exact setup instructions from the relevant current documentation
   or bundled skill. Do not improvise install commands from memory.
2. In one or two plain sentences, say what will be installed, what it enables,
   and roughly how large it is.
3. Ask before installing. If the user declines, accept that and give the
   no-install alternative when one exists.
4. Install, then verify with the smallest meaningful check.
5. Report what succeeded or failed without hiding a partial result.

Keep provider credentials in Settings. Never display a stored key back to the
user. Install only what the current instructions or the user explicitly name.

For a one-time Pi migration, inspect `~/.pi/agent/`, list the provider/model
definitions and skills worth copying, and ask what to bring across. Copy only
the approved pieces into Alt Theory's own `~/.alt-theory/pi-agent/` or the
shared skills directory. Never change Pi's source files and never create
ongoing sync.
