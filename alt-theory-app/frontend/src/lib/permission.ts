/**
 * The permission control's three choices (owner 2026-09-25): shared by the
 * composer menu and the Settings default. Stored per conversation as the
 * mode plus Full Access; see `permissionOf` in lib/conversation.
 */
import type { Permission } from "@/api/types";
import { t } from "@/i18n";

export const PERMISSIONS: Permission[] = ["read-only", "ask", "full"];

export const PERMISSION_ICON: Record<Permission, string> = {
  "read-only": "ph-eye",
  ask: "ph-shield",
  full: "ph-shield-warning",
};

export const PERMISSION_LABEL: Record<Permission, () => string> = {
  "read-only": () => t("Read-only"),
  ask: () => t("Ask for approval"),
  full: () => t("Full access"),
};

export const PERMISSION_DETAIL: Record<Permission, () => string> = {
  "read-only": () => t("No commands; every file change asks you first"),
  ask: () => t("Works in your folders; asks before risky actions or leaving them"),
  full: () => t("Tools run without approval prompts"),
};

/** What the Full access confirmation lists (composer and Settings alike). */
export function fullAccessConsequences(): string[] {
  return [
    t("Bypasses the security extension's command blocks and approvals"),
    t("Bypasses credential-path access limits"),
    t("Approval prompts and writable-folder checks for external reads and writes are skipped"),
    t("Network access limits are skipped"),
    t("These decisions are no longer written to the security audit log"),
    t("Branches, side conversations and subagents start with Ask for approval instead"),
  ];
}
