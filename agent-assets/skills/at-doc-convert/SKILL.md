---
name: at-doc-convert
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
installing dependencies — follow the at-alt-theory-help setup procedure,
never install silently.

## Setup

`uv tool install "markitdown[all]"` (the at-alt-theory-help setup procedure
says when to confirm first).
