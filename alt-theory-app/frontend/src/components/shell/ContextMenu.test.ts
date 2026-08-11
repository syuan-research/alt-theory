import assert from "node:assert/strict";
import test from "node:test";
import { scrollAffectsAnchor } from "./ContextMenu";

test("unrelated pane output scrolling does not close a contextual menu", () => {
  const anchor = {} as Node;
  assert.equal(
    scrollAffectsAnchor(anchor, { contains: () => false } as unknown as EventTarget),
    false,
  );
  assert.equal(
    scrollAffectsAnchor(anchor, { contains: () => true } as unknown as EventTarget),
    true,
  );
  assert.equal(scrollAffectsAnchor(anchor, null), true);
});
