# Compatibility, Formats, and Known Limitations

The reference tables. Anything listed as a limitation is a current
boundary, stated so it can be planned around, not a promise of when it
changes.

## Platforms

| Platform | Status |
|---|---|
| Windows x64 | Public Beta folder ZIP and tested source build |
| macOS (Apple Silicon) | Planned before v1.4; internal hard-bug validation remains |
| Other combinations (Intel Mac, Windows ARM, Linux) | Not tested, not claimed; source builds may work but are unverified |

## Interface languages

| Language | Status |
|---|---|
| English | Current |
| Chinese, simplified (zh-Hans) | Current |
| Chinese, traditional Hong Kong (zh-Hant-HK) | Current |

Conversation language is model-dependent and effectively unrestricted:
the agent answers in the language you use.

## File formats

| Format | Read | Produce |
|---|---|---|
| Markdown / plain text | Yes | Yes |
| Word (.docx) | Yes | Yes (as new files; needs one-time components install) |
| PDF | Text extraction (no OCR; scanned or image-only PDFs don't extract) | No |
| Excel (.xlsx) | Yes | Yes (as new files; components install) |
| PowerPoint (.pptx) | Yes (per-slide text) | Yes (as new files; components install) |
| Images (PNG, JPEG, GIF, WebP) | With an image-capable model | Diagrams as mermaid in conversation |

## Import sources

| Source | Status |
|---|---|
| Pi | Native format; continuable directly rather than via the import dialog |
| Claude Code | Supported |
| Codex | Supported (encrypted reasoning and summaries stay unreplayed, labelled) |
| OpenCode | Supported |
| Grok Build | Supported |
| Other tools | Not supported; export-to-markdown from the source tool is the manual path |

Import is local-only (the source tool's data must be on this computer)
and read-only toward the source. Boundary details:
[Imports](../system-guide/imports-and-continuity.md).

## Provider access

API keys work for any configured compatible provider (including
Anthropic). Subscription sign-in is available for supported providers
(currently OpenRouter, xAI/Grok, and OpenAI Codex). Local model servers
with compatible APIs can be configured as providers.

## Known limitations

- No tracked-changes Word output. Revising a .docx produces an edited
  copy plus a plain-language change summary, not Word revision marks.
- No OCR. Scanned image-only PDFs have no extractable text.
- No cloud-document integration. Google Docs, Overleaf, and similar are
  out of reach except via manual export and import of files.
- No live lookup in Understand mode. Understand uses labelling instead
  ([why](../system-guide/search-sources-web.md)).
- Paywalls are not bypassed. Public abstracts are what you get from
  paywalled sources.
- No reference-manager integration. Zotero or EndNote field codes in
  documents survive untouched in originals (originals are never edited),
  but the app does not read or write reference-manager data.
- One conversation per window focus. Parallel Work conversations run and
  signal their state, but there is one active view; heavy multi-agent
  orchestration is not this product.
- Beta movement. Interfaces and bundled assets may still change between
  releases; [the policy](../advanced/compatibility-updates-debugging.md)
  states what is and is not protected.
