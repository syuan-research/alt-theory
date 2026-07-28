# Documents, Images, and Other Inputs

Research materials come as Word documents, PDFs, spreadsheets, slides,
and images. This page is the canonical reference for getting them in and
getting documents out.

## What the app reads

Files in a working folder or attached to the conversation can be read in
their real formats:

- **Word (.docx)** — text extracted for reading and discussion.
- **PDF** — text extraction; page references are preserved where
  possible. (Scanned image-only PDFs have no text to extract — a current
  limitation, stated rather than worked around.)
- **Excel (.xlsx)** — sheets readable as data.
- **PowerPoint (.pptx)** — per-slide text extraction.

For a standalone, inspectable conversion — or batch work — the agent can
produce a markdown copy of a document; converted files appear **next to
their originals** with a `_converted` suffix, so the pairing stays
visible and your original is obviously untouched.

## Attaching vs folder access

- **Attachments** put specific files in front of the agent for this
  conversation: drag onto the composer, use the attach button, or send
  from the file panel. The attachment is referenced in your message, so
  the agent knows exactly which files you mean.
- **Working-folder access** (Work mode) lets the agent find and read
  project files itself as the work requires —
  [details](working-folders-files-paths.md).

## Images

Attach images the same ways. Whether the *model* can see an image depends
on the model: image-capable models receive the image itself; text-only
models see that an image was attached and say they cannot read it —
nothing breaks.

The app tracks image capability per model in your model configuration.
If you know your model reads images but the app treats it as text-only,
ask the agent to check and record the model's image support — there is a
bundled skill for exactly this; it verifies against the provider's
current documentation rather than guessing from the model's name, and
updates the configuration with you.

## Producing documents

Asking for output "as a document" produces a **new file** in the working
folder, clearly named, never overwriting anything of yours. Formats that
need generation components (writing .docx, .pptx, .xlsx) may require a
one-time dependency install, proposed through
[guided setup](helper-and-guidance.md) and done only with your yes.

Current honest boundary: revising *your* Word document produces an edited
**copy** plus a plain-language summary of changes — Word's own
tracked-changes format for output is not yet supported. See
[Known Limitations](../help/compatibility-formats-limitations.md).

## Verify

- What the agent actually read: tool lines name each file opened; a
  synthesis names its sources.
- Whether your model reads images: the model's entry in Settings →
  Models shows its recorded input types.

## Recovery

- **A document fails to read**: check it opens in its native app at all;
  password-protected and corrupted files do not extract. For scanned
  PDFs, see the limitation above.
- **An image was ignored**: the model is likely text-only — check its
  recorded capability, or run the image-support check above and reopen
  the conversation.
- **A conversion looks wrong** (mangled tables, lost formatting):
  conversion favors readable text over layout fidelity; for
  layout-critical work, keep the original as the source of truth and use
  the conversion for discussion.
