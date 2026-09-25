/**
 * The reviewer setting as the composer and Settings share it: one fetch,
 * one copy, every reader re-renders when Settings saves.
 */
import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import {
  getApprovalReviewer,
  saveApprovalReviewer,
  type ApprovalReviewerSettings,
  type ModelChain,
} from "@/api/config";

let current: ApprovalReviewerSettings | null = null;
let loading = false;
const listeners = new Set<() => void>();
const publish = (next: ApprovalReviewerSettings) => {
  current = next;
  listeners.forEach((listener) => listener());
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!current && !loading) {
    loading = true;
    getApprovalReviewer()
      .then(publish)
      .catch(() => {})
      .finally(() => {
        loading = false;
      });
  }
  return () => listeners.delete(listener);
}

/** null until loaded (or in hosted mode, where the route is closed). */
export function useApprovalReviewer(): ApprovalReviewerSettings | null {
  return useSyncExternalStore(subscribe, () => current);
}

export function setApprovalReviewer(reviewer: ModelChain | null): Promise<void> {
  if (current) publish({ ...current, reviewer });
  return saveApprovalReviewer({ reviewer }).then(publish);
}

export function dismissApprovalHint(): void {
  if (current) publish({ ...current, hintDismissed: true });
  void saveApprovalReviewer({ hintDismissed: true }).then(publish).catch(() => {});
}

/** A chain reference as the user reads it: `inherit:low` → "this conversation's model · low". */
export function modelReferenceLabel(reference: string): string {
  const [model, thinking] = /^(.*?)(?::(off|minimal|low|medium|high|xhigh|max))?$/.exec(reference)!.slice(1);
  const name = model === "inherit" ? t("this conversation's model") : model;
  return thinking ? `${name} · ${thinking}` : name;
}
