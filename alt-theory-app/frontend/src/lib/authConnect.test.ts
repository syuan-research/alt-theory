import assert from "node:assert/strict";
import { test } from "node:test";
import { authConnectEntryStep } from "./authConnect.ts";

test("a connected account opens as manage unless reconnect was requested", () => {
  assert.equal(authConnectEntryStep(true, false), "manage");
  assert.equal(authConnectEntryStep(true, true), "link");
  assert.equal(authConnectEntryStep(false, false), "link");
  assert.equal(authConnectEntryStep(false, true), "link");
});
