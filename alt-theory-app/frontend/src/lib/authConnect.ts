/**
 * How the OAuth card opens. A stored login is a connected account, not a
 * sign-in in progress: only an explicit reconnect request (failed refresh)
 * enters the sign-in step.
 */
export function authConnectEntryStep(
  connected: boolean,
  reconnectRequested: boolean,
): "manage" | "link" {
  return connected && !reconnectRequested ? "manage" : "link";
}
