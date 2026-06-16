import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export type AccountRole = "participant" | "researcher" | "admin";
export type AccountStatus = "active" | "disabled";

export interface AccountConsentDefaults {
  researcherReadable: boolean;
  quoteAfterAnonymization: boolean;
}

export interface AccountLimits {
  maxTurnsPerSession?: number | null;
  maxSessions?: number | null;
}

export interface AccountRecord {
  schemaVersion: 1;
  accountId: string;
  displayLabel: string;
  role: AccountRole;
  status: AccountStatus;
  loginCodeHash: string;
  defaultRoleCondition: string | null;
  defaultConsent: AccountConsentDefaults;
  limits?: AccountLimits;
  createdAt: string;
  updatedAt: string;
}

export interface AccountStoreFile {
  schemaVersion: 1;
  accounts: AccountRecord[];
}

export interface SafeAccount {
  accountId: string;
  displayLabel: string;
  role: AccountRole;
  status: AccountStatus;
  defaultRoleCondition: string | null;
  defaultConsent: AccountConsentDefaults;
  limits?: AccountLimits;
}

export type AccountAuthResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; reason: "missing" | "disabled" | "invalid_code" };

const HASH_PREFIX = "scrypt-v1";
const SCRYPT_KEY_LENGTH = 32;

export function accountsDir(dataDir: string): string {
  return resolve(dataDir, "accounts");
}

export function accountsFile(dataDir: string): string {
  return join(accountsDir(dataDir), "accounts.json");
}

export function hashLoginCode(code: string, salt?: string): string {
  const resolvedSalt = salt ?? randomBytes(16).toString("base64url");
  const hash = scryptSync(code, resolvedSalt, SCRYPT_KEY_LENGTH).toString(
    "base64url"
  );
  return `${HASH_PREFIX}:${resolvedSalt}:${hash}`;
}

export function verifyLoginCode(code: string, encodedHash: string): boolean {
  const [prefix, salt, expected] = encodedHash.split(":");
  if (prefix !== HASH_PREFIX || !salt || !expected) return false;
  const actual = scryptSync(code, salt, SCRYPT_KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actual.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actual, expectedBuffer);
}

export function readAccountStore(dataDir: string): AccountStoreFile {
  const file = accountsFile(dataDir);
  if (!existsSync(file)) return { schemaVersion: 1, accounts: [] };
  const parsed = JSON.parse(readFileSync(file, "utf-8")) as AccountStoreFile;
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.accounts)) {
    throw new Error("Invalid account store");
  }
  return {
    schemaVersion: 1,
    accounts: parsed.accounts.map(normalizeAccountRecord),
  };
}

export function writeAccountStore(
  dataDir: string,
  store: AccountStoreFile
): void {
  mkdirSync(accountsDir(dataDir), { recursive: true });
  writeJsonAtomic(accountsFile(dataDir), {
    schemaVersion: 1,
    accounts: store.accounts.map(normalizeAccountRecord),
  });
}

export function findAccount(
  dataDir: string,
  accountId: string
): AccountRecord | null {
  return (
    readAccountStore(dataDir).accounts.find(
      (account) => account.accountId === accountId
    ) ?? null
  );
}

export function authenticateAccount(
  dataDir: string,
  accountId: string,
  loginCode: string
): AccountAuthResult {
  const account = findAccount(dataDir, accountId);
  if (!account) return { ok: false, reason: "missing" };
  if (account.status !== "active") return { ok: false, reason: "disabled" };
  if (!verifyLoginCode(loginCode, account.loginCodeHash)) {
    return { ok: false, reason: "invalid_code" };
  }
  return { ok: true, account };
}

export function toSafeAccount(account: AccountRecord): SafeAccount {
  return {
    accountId: account.accountId,
    displayLabel: account.displayLabel,
    role: account.role,
    status: account.status,
    defaultRoleCondition: account.defaultRoleCondition,
    defaultConsent: { ...account.defaultConsent },
    ...(account.limits ? { limits: { ...account.limits } } : {}),
  };
}

function normalizeAccountRecord(account: AccountRecord): AccountRecord {
  if (account?.schemaVersion !== 1) {
    throw new Error("Invalid account record schemaVersion");
  }
  if (!isSafeId(account.accountId)) {
    throw new Error(`Invalid account id: ${account.accountId}`);
  }
  if (!["participant", "researcher", "admin"].includes(account.role)) {
    throw new Error(`Invalid account role: ${account.role}`);
  }
  if (!["active", "disabled"].includes(account.status)) {
    throw new Error(`Invalid account status: ${account.status}`);
  }
  if (typeof account.loginCodeHash !== "string" || !account.loginCodeHash) {
    throw new Error(`Invalid loginCodeHash for account: ${account.accountId}`);
  }
  return {
    schemaVersion: 1,
    accountId: account.accountId,
    displayLabel: String(account.displayLabel || account.accountId),
    role: account.role,
    status: account.status,
    loginCodeHash: account.loginCodeHash,
    defaultRoleCondition: account.defaultRoleCondition ?? null,
    defaultConsent: {
      researcherReadable: Boolean(account.defaultConsent?.researcherReadable),
      quoteAfterAnonymization: Boolean(
        account.defaultConsent?.quoteAfterAnonymization
      ),
    },
    ...(account.limits ? { limits: { ...account.limits } } : {}),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function isSafeId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}
