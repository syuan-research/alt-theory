# Permissions, Approvals, and Agent Activity

What the agent may do, what always asks, how you see what is happening.

## The model, in layers

1. Understand mode: no command execution, no live network, no project
   folders. The conversation, attachments, and selected knowledge base are
   the whole surface. Reads beyond it trigger approval.
2. Work mode, inside attached folders: works without asking per turn.
   Reading, writing, running commands the skills describe.
3. Work mode, at the boundary: some things always ask. Reading outside
   your folders; network beyond built-in search and fetch; installing
   anything; and operations the policy flags (file-system destruction,
   privilege escalation, credential-path access, dangerous commands such
   as rm, curl, ssh, chmod, paths escaping the workspace, suspicious
   network destinations).

## An approval request

The conversation pauses and shows the operation (what is being attempted)
and the scope (what saying yes grants). Options are allow-once and deny at
minimum; broader scopes (allow for this session, for the session's lifetime)
are offered where the policy supports them.

- Deny: the agent finds another path or says what it cannot do. The
  conversation continues.
- No response (timeout or closed conversation): resolves as rejection.

## What this is

A policy layer checks operations against rules, and approvals put you in
the loop at the boundary. It is a check in trusted code, not an
operating-system sandbox. Two consequences follow:

- The check is for oversight of an agent doing real work, not for
  containing malicious software.
- Extensions and tools you install run with your user's permissions. The
  policy constrains operations; it cannot make an untrusted extension
  safe to install. Install what you trust, as with any program.

Every block and approval is appended to a per-session security audit log.

## Seeing what the agent does

- In the conversation: every action is a
  [tool line](responses-and-controls.md) as it happens. A turn that
  changed files ends with the changed-files card.
- Across conversations: the list marks each row's state (running,
  finished-unread, failed, waiting for approval). A run that finishes,
  fails, or blocks on approval while the window is in the background
  raises a system notification.

## Recovery

- Denied and stalled: say what you would rather it do. Attach the folder
  or approve on re-request if the access was needed.
- Approved something you regret: allow-once is spent when used; session
  scopes expire.
- Interrupted mid-flight: completed steps are in the transcript.
