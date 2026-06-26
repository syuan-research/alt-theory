import { fetchJson, fetchVoid } from "./http";
import type { AuthMeResponse } from "./types";

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  return fetchJson<AuthMeResponse>("/api/auth/me");
}

export async function detectAccountsConfigured(
  appMode: "local" | "hosted"
): Promise<boolean> {
  if (appMode === "local") return false;
  try {
    const res = await fetch("/api/sessions");
    return res.status === 401;
  } catch {
    return false;
  }
}

export async function login(
  accountId: string,
  loginCode: string
): Promise<void> {
  await fetchVoid("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, loginCode }),
  });
}

export async function logout(): Promise<void> {
  await fetchVoid("/api/auth/logout", { method: "POST" });
}