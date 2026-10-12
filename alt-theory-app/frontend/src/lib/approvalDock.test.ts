import assert from "node:assert/strict";
import { test } from "node:test";
import { permissionOf, smartApprovalOfPermission } from "@/lib/conversation";
import { approvalParts } from "@/components/conversation/ApprovalDock";

test("the dock reads the reasons, the kind and the command from the title", () => {
  const parts = approvalParts(
    "Smart approval unavailable: rate limited\nNeeds approval: Push to: origin\nNeeds approval: Too complex to check\nRun command: git push origin main\necho done",
  );
  assert.match(parts.note ?? "", /rate limited/);
  assert.deepEqual(parts.reasons, ["Push to: origin", "Too complex to check"]);
  assert.equal(parts.label, "Run command");
  assert.equal(parts.value, "git push origin main\necho done");
  assert.deepEqual(approvalParts("Write file: /x/notes.md").reasons, []);
});

test("strict smart approval is its own permission, stored as smartApproval: \"strict\"", () => {
  assert.equal(permissionOf({ mode: "work", fullAccess: false, smartApproval: "strict" }), "smart-strict");
  assert.equal(permissionOf({ mode: "work", fullAccess: false, smartApproval: true }), "smart");
  assert.equal(permissionOf({ mode: "work", fullAccess: true, smartApproval: "strict" }), "full");
  assert.equal(permissionOf({ mode: "read-only", fullAccess: false, smartApproval: "strict" }), "read-only");
  assert.equal(smartApprovalOfPermission("smart-strict"), "strict");
  assert.equal(smartApprovalOfPermission("smart"), true);
  assert.equal(smartApprovalOfPermission("ask"), false);
});
