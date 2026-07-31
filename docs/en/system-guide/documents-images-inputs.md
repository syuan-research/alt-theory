# Documents, Images, and Other Inputs

## What the app reads

Files in a working folder or attached to the conversation can be read in
their real formats:

- Word (.docx): text extracted.
- PDF: text extraction with page references where possible. Scanned
  image-only PDFs have no text to extract.
- Excel (.xlsx): sheets readable as data.
- PowerPoint (.pptx): per-slide text extraction.

For a standalone or batch conversion, the agent can produce a markdown
copy of a document. Converted files appear next to their originals with a
`_converted` suffix, so the pairing stays visible and your original is
untouched.

## Attaching versus folder access

- Attachments put specific files in front of the agent for this
  conversation: use the attach button or send from the file panel.
- Working-folder access (Work mode) lets the agent find and read project
  files itself ([details](working-folders-files-paths.md)).

## Images

Attach images the same ways. Whether the model can see an image depends on
the model: image-capable models receive the image; text-only models see
that an image was attached and say they cannot read it.

The app tracks image capability per model in your model configuration. If
you know your model reads images but the app treats it as text-only, ask
Helper to check and record the model's image support. Its image-support
procedure verifies this against the provider's current documentation rather
than guessing from the model's name.

## Producing documents

Asking for output "as a document" produces a new file in the working
folder, clearly named, never overwriting anything of yours. Formats that
need generation components (.docx, .pptx, .xlsx) may require a one-time
dependency install, proposed through
[guided setup](helper-and-guidance.md) and done only with your yes.

One boundary: revising your Word document produces an edited copy plus a
plain-language summary of changes. Word's tracked-changes format for
output is not supported. See
[Known Limitations](../help/compatibility-formats-limitations.md).

## Recovery

- A document fails to read: check it opens in its native app.
  Password-protected and corrupted files do not extract. For scanned PDFs,
  see the limitation above.
- An image was ignored: the model is likely text-only. Check its recorded
  capability, or run the image-support check and reopen the conversation.
- A conversion looks wrong: conversion favors readable text over layout
  fidelity. For layout-critical work, keep the original as the source of
  truth.
