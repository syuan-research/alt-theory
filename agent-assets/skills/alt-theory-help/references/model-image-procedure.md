# Model image-support procedure

Use this when image input support for a specific provider/model is unknown or
needs correcting.

1. Check the provider's current model documentation or model list. Do not infer
   support from the model name.
2. State what was verified and the remaining uncertainty.
3. In Alt Theory's `models.json`, the model's `input` list is `["text"]` for
   text-only or `["text", "image"]` when image input is supported.
4. Locate the live file from current runtime/docs rather than assuming a fixed
   path. The app stores it as `<agentDir>/models.json`.
5. In Work, make the approved edit when the file is reachable. Otherwise show
   the exact change for the user to make.

Unknown support never blocks sending; a text-only model can simply say it
cannot read the attached image.
