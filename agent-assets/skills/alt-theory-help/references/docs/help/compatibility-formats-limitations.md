# Compatibility, Formats, and Known Limitations

The reference tables, kept honest. Anything listed as a limitation is a
current boundary, stated so you can plan around it — not a promise of
when it changes.

## Platforms

| Platform | Status |
|---|---|
| macOS (Apple Silicon) | Supported (packaged app and source build) |
| Windows (x86) | Supported (packaged app and source build) |
| Other combinations (Intel Mac, Windows ARM, Linux) | Not tested, not claimed; source builds may work but are unverified |

## Interface languages

| Language | Status |
|---|---|
| English | Current |
| Chinese (simplified and traditional) | Planned |

Conversation language is model-dependent and effectively unrestricted —
the agent answers in the language you use.

## File formats

| Format | Read | Produce |
|---|---|---|
| Markdown / plain text | Yes | Yes |
| Word (.docx) | Yes | Yes (as new files; needs one-time components install) |
| PDF | Text extraction (no OCR — scanned/image-only PDFs don't extract) | No |
| Excel (.xlsx) | Yes | Yes (as new files; components install) |
| PowerPoint (.pptx) | Yes (per-slide text) | Yes (as new files; components install) |
| Images (PNG, JPEG, GIF, WebP) | With an image-capable model | Diagrams as mermaid in conversation |

## Import sources

| Source | Status |
|---|---|
| Claude Code | Supported |
| Codex | Supported (encrypted reasoning/summaries stay unreplayed, labelled) |
| OpenCode | Supported |
| Grok Build | Supported |
| Pi | Native format — continuable directly rather than via the import dialog |
| Other tools | Not supported; export-to-markdown from the source tool is the manual path |

Import is local-only (the source tool's data must be on this computer)
and read-only toward the source. Boundary details:
[Imports](../system-guide/imports-and-continuity.md).

## Provider access

API keys work for any configured compatible provider. Subscription
sign-in is available for supported providers (currently OpenRouter, xAI,
OpenAI Codex, Anthropic). Local model servers with compatible APIs can
be configured as providers.

## Known limitations

- **No tracked-changes Word output.** Revising your .docx produces an
  edited copy plus a plain-language change summary — not Word revision
  marks.
- **No OCR.** Scanned image-only PDFs have no extractable text.
- **No cloud-document integration.** Google Docs, Overleaf, and similar
  are out of reach except via manual export/import of files.
- **No live lookup in Understand mode** — by design, with honest
  labelling instead ([why](../system-guide/search-sources-web.md)).
- **Paywalls are not bypassed.** Public abstracts are what you get from
  paywalled sources.
- **No reference-manager integration.** Zotero/EndNote field codes in
  documents survive untouched in your originals (originals are never
  edited), but the app does not read or write reference-manager data.
- **One conversation per window focus** — parallel Work conversations
  run and signal their state, but there is one active view; heavy
  multi-agent orchestration is not this product.
- **Alpha movement.** Interfaces and bundled assets may still change
  between releases; [the policy](../advanced/compatibility-updates-debugging.md)
  says exactly what is and is not protected.
