# Where model configuration lives

Alt Theory keeps provider and model configuration in `models.json` inside the
app's data/configuration directory. The exact path depends on the install and
platform, so find it from current runtime state rather than assuming it.

To locate it and confirm the edit:

- Check the current Alt Theory documentation for the data-folder / model-setup
  location (the same place the Settings → Models and provider setup describe).
- Or read the app's configuration code: the model store is managed in
  `alt-theory-app/web-server/config-store.ts`, which defines the file as
  `<agentDir>/models.json` and the per-model shape, including
  `input?: ("text" | "image")[]`.

The field this skill changes is a single model's `input` list. Adding `"image"`
to it (`["text", "image"]`) marks that model as able to read images. Removing it
marks the model text-only again.

Do not hardcode modality facts here — this file only says WHERE and WHICH field.
Whether a given model actually supports images must be looked up live.
