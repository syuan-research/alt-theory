/**
 * Approval bridge (spec §5.2).
 *
 * Alt Theory embeds the Pi SDK in its own process, so Pi extension
 * `confirm`/`select`/`input` dialogs need a host UI. This bridge implements
 * Pi's ExtensionUIContext against the web UI: dialog requests become session
 * events the frontend renders, and the user's reply resolves the pending
 * promise. Modeled on Pi's own RPC-mode context (signal/timeout semantics,
 * safe no-ops for TUI-only surface).
 *
 * Fail-closed: with no reply (dispose, abort, timeout, no client) confirm
 * resolves false and select/input resolve undefined — extensions see a
 * rejection, never a silent allow (spec §5.3).
 */

import { randomUUID } from "crypto";
import type {
  ExtensionUIContext,
  ExtensionUIDialogOptions,
} from "@earendil-works/pi-coding-agent";

export interface ApprovalRequest {
  approvalId: string;
  kind: "confirm" | "select" | "input";
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  timeoutMs?: number;
}

export interface ApprovalResponse {
  /** confirm dialogs */
  accept?: boolean;
  /** select dialogs: one of the offered options, or null to cancel */
  choice?: string | null;
  /** input dialogs: entered text, or null to cancel */
  text?: string | null;
}

export type ApprovalResolution = "responded" | "cancelled" | "timeout";

export interface ApprovalBridgeEvents {
  onRequest: (request: ApprovalRequest) => void;
  onResolve: (approvalId: string, resolution: ApprovalResolution) => void;
  onNotify: (message: string, level: "info" | "warning" | "error") => void;
}

interface PendingApproval {
  resolve: (response: ApprovalResponse | null) => void;
}

export class ApprovalBridge {
  private readonly pending = new Map<string, PendingApproval>();
  readonly uiContext: ExtensionUIContext;

  constructor(private readonly events: ApprovalBridgeEvents) {
    this.uiContext = this.createUiContext();
  }

  /** Resolve a pending dialog with the user's reply. */
  respond(approvalId: string, response: ApprovalResponse): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) {
      return false;
    }
    this.pending.delete(approvalId);
    this.events.onResolve(approvalId, "responded");
    entry.resolve(response);
    return true;
  }

  /** Currently pending dialog requests (for late-joining clients). */
  listPending(): string[] {
    return [...this.pending.keys()];
  }

  /** Cancel all pending dialogs (session dispose/replacement). */
  disposeAll(): void {
    for (const [approvalId, entry] of this.pending) {
      this.events.onResolve(approvalId, "cancelled");
      entry.resolve(null);
    }
    this.pending.clear();
  }

  private request(
    kind: ApprovalRequest["kind"],
    fields: Pick<ApprovalRequest, "title" | "message" | "options" | "placeholder">,
    opts: ExtensionUIDialogOptions | undefined
  ): Promise<ApprovalResponse | null> {
    if (opts?.signal?.aborted) {
      return Promise.resolve(null);
    }
    const approvalId = randomUUID();
    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout | undefined;
      const settle = (
        response: ApprovalResponse | null,
        resolution: Exclude<ApprovalResolution, "responded"> | null
      ) => {
        if (timeoutId) clearTimeout(timeoutId);
        opts?.signal?.removeEventListener("abort", onAbort);
        if (this.pending.delete(approvalId) && resolution) {
          this.events.onResolve(approvalId, resolution);
        }
        resolve(response);
      };
      const onAbort = () => settle(null, "cancelled");
      opts?.signal?.addEventListener("abort", onAbort, { once: true });
      if (opts?.timeout) {
        timeoutId = setTimeout(() => settle(null, "timeout"), opts.timeout);
      }
      this.pending.set(approvalId, {
        resolve: (response) => settle(response, null),
      });
      this.events.onRequest({
        approvalId,
        kind,
        ...fields,
        ...(opts?.timeout ? { timeoutMs: opts.timeout } : {}),
      });
    });
  }

  private createUiContext(): ExtensionUIContext {
    const bridge = this;
    const context = {
      async confirm(title: string, message: string, opts?: ExtensionUIDialogOptions) {
        const response = await bridge.request("confirm", { title, message }, opts);
        return response?.accept === true;
      },
      async select(title: string, options: string[], opts?: ExtensionUIDialogOptions) {
        const response = await bridge.request("select", { title, options }, opts);
        const choice = response?.choice;
        return typeof choice === "string" && options.includes(choice)
          ? choice
          : undefined;
      },
      async input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions) {
        const response = await bridge.request("input", { title, placeholder }, opts);
        return typeof response?.text === "string" ? response.text : undefined;
      },
      notify(message: string, type?: "info" | "warning" | "error") {
        bridge.events.onNotify(message, type ?? "info");
      },
      // --- TUI-only surface: safe no-ops, same posture as Pi's RPC mode ---
      onTerminalInput: () => () => {},
      setStatus: () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: async () => undefined,
      pasteToEditor: () => {},
      setEditorText: () => {},
      getEditorText: () => "",
      editor: async () => undefined,
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      get theme(): never {
        throw new Error(
          "Terminal theme access is not available in the Alt Theory web runtime"
        );
      },
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({
        success: false,
        error: "Theme switching is not available in the Alt Theory web runtime",
      }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
    };
    return context as unknown as ExtensionUIContext;
  }
}
