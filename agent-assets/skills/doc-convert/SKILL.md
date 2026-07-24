---
name: doc-convert
description: Convert documents between formats — docx/pptx/xlsx/pdf to markdown for reading, and produce new document files for the user. Use when a workspace file needs converting or the user asks for output as a document.
category: doc-conversion
subtypes: [convert.doc]
---

# Document conversion

## Reading (any → markdown)

The app already extracts docx/pdf/xlsx for reading in the workspace. When
you need a standalone conversion (pptx, batch work, or a cleaner render):

```bash
markitdown "file.docx" > file_converted.md   # also pptx, xlsx, pdf
```

Name converted files `{original}_converted.md`, next to the original.

## Producing documents

The original file is never touched: output is always a NEW file, clearly
named, and you tell the user which file you wrote. If asked to revise a
document, work on a copy and summarize your changes in plain language —
the user's own file is theirs alone.

Formats needing generation libraries (docx/pptx/xlsx writing) may require
installing dependencies — go through the helper flow, never install
silently.

## Setup

`uv tool install "markitdown[all]"` (helper flow confirms first).

If the user has installed their own document skill (e.g. a docx or xlsx
skill), defer to it — it is likely richer than this one.
