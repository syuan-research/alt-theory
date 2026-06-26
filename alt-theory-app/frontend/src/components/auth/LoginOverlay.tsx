import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldFrame, TextInput } from "@/components/ui/Field";
import { SectionTitle } from "@/components/ui/Typography";

interface LoginOverlayProps {
  onLogin: (accountId: string, loginCode: string) => Promise<void>;
  error: string | null;
}

export function LoginOverlay({ onLogin, error }: LoginOverlayProps) {
  const [accountId, setAccountId] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await onLogin(accountId.trim(), loginCode);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-hairline bg-surface p-5 shadow-sm"
      >
        <SectionTitle>Sign in</SectionTitle>
        <FieldFrame label="Account ID" hint="Use the account id provided for this pilot.">
          <TextInput
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            placeholder="account id"
            autoComplete="username"
          />
        </FieldFrame>
        <FieldFrame label="Login code" hint="Codes are case-sensitive.">
          <TextInput
            value={loginCode}
            onChange={(event) => setLoginCode(event.target.value)}
            placeholder="login code"
            type="password"
            autoComplete="current-password"
          />
        </FieldFrame>
        {localError || error ? (
          <p className="text-[0.8125rem] text-danger">{localError || error}</p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={submitting || !accountId.trim() || !loginCode}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}