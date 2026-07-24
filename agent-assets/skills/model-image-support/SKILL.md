---
name: model-image-support
description: Find out whether the current conversation's model can read images (vision / multimodal), and record that in Alt Theory's model configuration. Use when a user attaches or asks about an image and it is unclear whether the model supports images, or when the user asks to enable image support for a model.
---

# Model image support

Two jobs: (1) find out whether a specific model can read images, and (2) record
that fact in Alt Theory's model configuration so the app knows. This skill does
NOT carry the answer — models change, and a hardcoded list would go stale. Look
it up live each time.

Never block the conversation on this. If image support is unknown, the user can
still send; a text-only model simply replies that it cannot read the image.

## 1. Find out if the model supports images

You are told the model's provider and id. Determine whether that exact model
accepts image input:

- Prefer an authoritative source: the provider's own model documentation or
  model list. Use a web lookup if a web tool is available.
- If you cannot verify it, ask the user — they may know from the provider's
  pricing/model page, or can paste the relevant line from its docs.
- Do not guess from the model name alone. "Vision"-sounding names are not proof,
  and capable models are often not labelled.

State plainly what you found and how sure you are.

## 2. Record it in the model configuration

Alt Theory stores each model's accepted input types in its models
configuration file, `models.json`, under the provider:

```
providers → <provider name> → models → (the model with this id) → input
```

`input` is a list. Text-only is `["text"]`; a model that also reads images is
`["text", "image"]`. To enable images for a model, add `"image"` to its `input`
list (create the field as `["text", "image"]` if it is absent).

Find the current location of `models.json` and the exact edit steps from the
live Alt Theory documentation or by reading the app's configuration code — do
not assume a fixed path, it depends on the install. See
`references/config.md` for where to look.

How to apply the change depends on the conversation's capabilities:

- **Work capability (can edit files):** if you can reach `models.json`, make the
  edit directly, then tell the user to reopen the conversation (or restart the
  app) so the new capability is picked up. The change goes through the normal
  approval prompt.
- **Understand capability (read-only), or no access to the config file:** do not
  attempt to write. Show the user the exact field and value to change and where
  the file is, and let them make the edit.

After recording it, the app can treat the model as image-capable; the user can
then attach images to that model's conversations.
