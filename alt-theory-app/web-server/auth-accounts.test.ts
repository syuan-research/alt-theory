import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateAccount,
  findAccount,
  hashLoginCode,
  readAccountStore,
  toSafeAccount,
  verifyLoginCode,
  writeAccountStore,
  type AccountRecord,
} from "./auth-accounts.js";

function tempDataDir(): string {
  return mkdtempSync(join(tmpdir(), "alt-theory-auth-"));
}

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  const now = "2026-06-16T00:00:00.000Z";
  return {
    schemaVersion: 1,
    accountId: "p01",
    displayLabel: "Participant 01",
    role: "participant",
    status: "active",
    loginCodeHash: hashLoginCode("code-123", "test-salt"),
    defaultRoleCondition: "conceptual-theory",
    defaultConsent: {
      researcherReadable: true,
      quoteAfterAnonymization: true,
    },
    limits: {
      maxTurnsPerSession: 20,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("account store reads missing file as empty store", () => {
  const dir = tempDataDir();
  try {
    assert.deepEqual(readAccountStore(dir), { schemaVersion: 1, accounts: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account store writes and finds normalized accounts", () => {
  const dir = tempDataDir();
  try {
    writeAccountStore(dir, { schemaVersion: 1, accounts: [account()] });
    const found = findAccount(dir, "p01");
    assert.equal(found?.displayLabel, "Participant 01");
    assert.equal(found?.defaultRoleCondition, "conceptual-theory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("login code hash verifies correct code and rejects wrong code", () => {
  const hash = hashLoginCode("secret-code", "stable-salt");
  assert.equal(verifyLoginCode("secret-code", hash), true);
  assert.equal(verifyLoginCode("wrong-code", hash), false);
  assert.equal(verifyLoginCode("secret-code", "bad-format"), false);
});

test("authenticateAccount covers valid, missing, disabled, and wrong-code accounts", () => {
  const dir = tempDataDir();
  try {
    writeAccountStore(dir, {
      schemaVersion: 1,
      accounts: [
        account(),
        account({
          accountId: "p02",
          status: "disabled",
          loginCodeHash: hashLoginCode("disabled-code", "disabled-salt"),
        }),
      ],
    });

    const valid = authenticateAccount(dir, "p01", "code-123");
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(valid.account.accountId, "p01");

    assert.deepEqual(authenticateAccount(dir, "missing", "code-123"), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(authenticateAccount(dir, "p02", "disabled-code"), {
      ok: false,
      reason: "disabled",
    });
    assert.deepEqual(authenticateAccount(dir, "p01", "wrong"), {
      ok: false,
      reason: "invalid_code",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("toSafeAccount strips loginCodeHash", () => {
  const safe = toSafeAccount(account());
  assert.equal(safe.accountId, "p01");
  assert.equal(safe.defaultConsent.researcherReadable, true);
  assert.equal("loginCodeHash" in safe, false);
});
