# Your Data, Privacy, and What Leaves This Machine

For research users this is not a preferences page — it is a compliance
question. Sensitive interviews, student records, data under a use
agreement, an embargoed manuscript under review: whether you can use a
tool at all depends on being able to say, defensibly, where the data
goes. This page is that answer, stated precisely.

## Where your data lives

Everything the app produces lives **locally, on this computer**, in one
application data directory: conversations and their histories, records
and configuration, files created in conversation workspaces. There is no
Alt Theory cloud, no account server, no telemetry pipeline, and no sync.
The app does not phone home.

Your own project files stay where they are — attaching a working folder
grants access; it does not copy or upload your project anywhere.

## What leaves this machine, exactly

Local-first does **not** mean nothing leaves. Three flows exist, all of
them initiated by your use:

1. **To your model provider.** This is the essential one to understand:
   everything the model responds to is sent to the provider you
   configured — your messages, and the content of files the agent reads
   in order to work with them. If the agent reads your interview
   transcript to answer a question about it, that transcript's text went
   to the provider, under your account and the provider's data terms.
   "The files stay local" is true of storage, not of what the model
   sees. Choose your provider accordingly for sensitive work — this is
   the same judgment as choosing where to email a draft.
2. **Live lookup (Work mode).** Searches go to the search services, and
   fetches go to the sites fetched. Query text is visible to those
   services, like any search you run in a browser.
3. **Nothing else.** No usage analytics, no content sharing, no
   third-party services beyond what you see the agent use in the
   conversation's own tool lines.

A practical consequence of (1): for material you may not send to any
third party, the boundary that matters is your model provider. A
provider you self-host or a provider with terms your agreement permits
changes the answer; the app itself adds no additional exposure.

## Deletion and retention

- The app applies **no automatic retention or expiry** to your local
  conversations — they are yours until you delete them.
- **Deleting a conversation** removes it from the app's catalog.
  Conversation data is ordinary local files in the app's data directory —
  auditable and removable; nothing is held anywhere else.
- What a **provider** retains from what was sent to it is governed by
  that provider's terms, not by the app — the same as any API use.

**Backup and moving machines** follow directly: the data directory *is*
the application state. Copy it and you have backed everything up; place
the copy on a new machine and the app picks it up. No export ceremony,
no account migration.

## Saying it to an ethics board

The one-paragraph version, accurate as written: *the application stores
all conversations and working data locally on the researcher's machine
and transmits nothing except to the researcher's configured AI model
provider — which receives conversation content and the content of files
the assistant is asked to read — and, when live search is used, query
text to the queried services. No third-party analytics or storage
services are involved.*

## Verify

- What the agent read (and therefore what the provider saw): the
  [tool lines](responses-and-controls.md) name every file read, every
  search run, every page fetched — per turn, in the transcript.
- Where the data directory is: shown in the app's About/settings surface,
  and inspectable like any local folder.
