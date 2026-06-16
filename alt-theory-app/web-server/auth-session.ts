import { randomBytes } from "crypto";
import type { Request, Response } from "express";
import {
  authenticateAccount,
  findAccount,
  toSafeAccount,
  type AccountConsentDefaults,
  type AccountRecord,
  type AccountRole,
  type SafeAccount,
} from "./auth-accounts.js";

export const AUTH_COOKIE_NAME = "alt_theory_auth";

export interface AuthContext {
  accountId: string | null;
  role: "anonymous" | AccountRole;
  displayLabel: string | null;
  defaultRoleCondition: string | null;
  defaultConsent: AccountConsentDefaults | null;
}

export type LoginResult =
  | { ok: true; account: SafeAccount; token: string }
  | { ok: false; status: 401 | 403; error: string };

interface AuthSessionRecord {
  token: string;
  accountId: string;
  createdAt: string;
  lastSeenAt: string;
}

export class AuthSessionManager {
  private readonly sessions = new Map<string, AuthSessionRecord>();

  constructor(
    private readonly dataDir: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  login(accountId: string, loginCode: string): LoginResult {
    const result = authenticateAccount(this.dataDir, accountId, loginCode);
    if (!result.ok) {
      if (result.reason === "disabled") {
        return { ok: false, status: 403, error: "Account is disabled" };
      }
      return { ok: false, status: 401, error: "Invalid account or code" };
    }
    const token = randomBytes(32).toString("base64url");
    const now = this.now().toISOString();
    this.sessions.set(token, {
      token,
      accountId: result.account.accountId,
      createdAt: now,
      lastSeenAt: now,
    });
    return { ok: true, account: toSafeAccount(result.account), token };
  }

  logoutFromRequest(req: Pick<Request, "headers">): void {
    const token = authTokenFromRequest(req);
    if (token) this.sessions.delete(token);
  }

  resolveRequest(req: Pick<Request, "headers">): AuthContext {
    const token = authTokenFromRequest(req);
    if (!token) return anonymousAuthContext();
    const session = this.sessions.get(token);
    if (!session) return anonymousAuthContext();
    const account = findAccount(this.dataDir, session.accountId);
    if (!account || account.status !== "active") {
      this.sessions.delete(token);
      return anonymousAuthContext();
    }
    session.lastSeenAt = this.now().toISOString();
    return authContextForAccount(account);
  }
}

export function setAuthCookie(res: Response, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
  );
}

export function clearAuthCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function authTokenFromRequest(
  req: Pick<Request, "headers">
): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies.get(AUTH_COOKIE_NAME) ?? null;
}

export function anonymousAuthContext(): AuthContext {
  return {
    accountId: null,
    role: "anonymous",
    displayLabel: null,
    defaultRoleCondition: null,
    defaultConsent: null,
  };
}

export function authContextForAccount(account: AccountRecord): AuthContext {
  return {
    accountId: account.accountId,
    role: account.role,
    displayLabel: account.displayLabel,
    defaultRoleCondition: account.defaultRoleCondition,
    defaultConsent: { ...account.defaultConsent },
  };
}

function parseCookieHeader(
  cookieHeader: Request["headers"]["cookie"]
): Map<string, string> {
  const value = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : cookieHeader;
  const cookies = new Map<string, string>();
  if (!value) return cookies;
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }
  return cookies;
}
