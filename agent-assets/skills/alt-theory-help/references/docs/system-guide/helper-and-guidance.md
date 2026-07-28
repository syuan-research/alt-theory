# Helper and In-App Guidance

The docs you are reading are one way to learn the app. The other is built
in: the app explains itself, at the moments explanation is worth having.

## The Helper

The **Helper** is a side conversation for questions about Alt Theory
itself — how something works, where a setting lives, why something
behaved as it did, and guided setup of providers, keys, and tool
installs.

Two properties define it:

- **It starts fresh.** The Helper does not read your current
  conversation. That is a privacy-respecting default and also what makes
  it reusable anywhere — it is the same assistant on the empty screen
  and mid-project. (For a tangent that *should* carry your context, use
  [BTW](responses-and-controls.md) instead; the app states this
  distinction at the moment you choose.)
- **It answers from current documentation.** The Helper's own rules
  require it to consult the product's current docs for anything concrete
  or changeable — and to say what it could not verify rather than invent
  steps from memory. An honest "I can't confirm this, check here" is in
  its vocabulary by design.

Open it from the Toolbox ("Ask how Alt works"). If a Helper exchange
turns out to matter to your project, promote it to a branch and it
becomes a normal conversation.

## Guided setup

Setup tasks — a missing tool, a provider to configure, the optional
browser tier for journal access — run through the
[setup-helper skill](bundled-skills.md#setup-helper) in plain language:
what will be installed, what it lets you do, how big it is, then your
yes or no, then verification that it actually worked. Nothing installs
silently; a declined install gets you the no-install alternative where
one exists.

One mode note: *explaining* setup is available anywhere — the Helper
answers configuration questions in any conversation. *Performing* an
install is an action, so it runs in a Work-capable conversation; if you
ask from Understand, you will be pointed to the switch rather than left
stuck.

## Teaching at the right moment

The app avoids both extremes of onboarding — the tour nobody reads and
the feature nobody finds:

- **One-time explanations** appear the first time you use an action that
  rewrites history (revising a message, first branch) — one short
  notice, once.
- **Rotating tips** surface one-line capabilities while you are already
  waiting (during thinking or long tool runs) — zero cost, no
  interruption.
- **The command palette teaches itself** — typing `/` is the app's own
  index.

## When the Helper is not enough

The Helper knows the product; it does not know your bug. For problems,
[Troubleshooting](../help/troubleshooting.md); for limits,
[Known Limitations](../help/compatibility-formats-limitations.md); for
humans, [Releases and Further Help](../help/releases-and-further-help.md).
