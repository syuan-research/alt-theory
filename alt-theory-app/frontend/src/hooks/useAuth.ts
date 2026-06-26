import { useCallback, useEffect, useState } from "react";
import {
  detectAccountsConfigured,
  fetchAuthMe,
  login as loginRequest,
} from "@/api/auth";
import type { AuthContext, DiscoveryLists } from "@/api/types";
import { fetchDiscovery } from "@/api/discovery";

export interface AuthState {
  auth: AuthContext;
  appMode: "local" | "hosted";
  accountsConfigured: boolean;
  loginRequired: boolean;
  discovery: DiscoveryLists | null;
  loading: boolean;
  error: string | null;
}

const anonymousAuth: AuthContext = {
  accountId: null,
  role: "anonymous",
  displayLabel: null,
  defaultRoleCondition: null,
  defaultConsent: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    auth: anonymousAuth,
    appMode: "hosted",
    accountsConfigured: false,
    loginRequired: false,
    discovery: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const me = await fetchAuthMe();
      const appMode = me.app?.mode === "local" ? "local" : "hosted";
      const accountsConfigured = await detectAccountsConfigured(appMode);
      const role = me.auth?.role ?? "anonymous";
      const loginRequired = role === "anonymous" && accountsConfigured;
      let discovery: DiscoveryLists | null = null;

      if (!loginRequired) {
        discovery = await fetchDiscovery();
      }

      setState({
        auth: me.auth ?? anonymousAuth,
        appMode,
        accountsConfigured,
        loginRequired,
        discovery,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        auth: anonymousAuth,
        appMode: "hosted",
        accountsConfigured: false,
        loginRequired: false,
        discovery: null,
        loading: false,
        error: err instanceof Error ? err.message : "Auth check failed",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (accountId: string, loginCode: string) => {
      await loginRequest(accountId, loginCode);
      window.location.reload();
    },
    []
  );

  return { ...state, refresh, login };
}