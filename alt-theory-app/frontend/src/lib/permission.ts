/**
 * The permission control's choices (owner 2026-09-25; smart approval
 * 2026-09-26; strict smart approval 2026-10-12): shared by the composer menu
 * and the Settings default. Stored per conversation as the mode plus Full
 * Access and smart approval; see `permissionOf` in lib/conversation.
 */
import type { Permission } from "@/api/types";
import { t } from "@/i18n";

/** The choices shown by default (at most four, owner 2026-10-12). */
export const PERMISSIONS: Permission[] = ["read-only", "ask", "smart", "full"];
/** With Settings' "all approval modes" on: strict smart approval too. */
export const ALL_PERMISSIONS: Permission[] = ["read-only", "ask", "smart", "smart-strict", "full"];

export const PERMISSION_ICON: Record<Permission, string> = {
  "read-only": "ph-eye",
  ask: "ph-shield",
  smart: "ph-shield-star",
  "smart-strict": "ph-shield-plus",
  full: "ph-shield-warning",
};

export const PERMISSION_LABEL: Record<Permission, () => string> = {
  "read-only": () => t("Read-only"),
  ask: () => t("Ask for approval"),
  smart: () => t("Smart approval"),
  "smart-strict": () => t("Strict smart approval"),
  full: () => t("Full access"),
};

export const PERMISSION_DETAIL: Record<Permission, () => string> = {
  "read-only": () => t("No commands; every file change asks you first"),
  ask: () => t("Asks before pushes, uploads, installs, and changes outside your folders"),
  smart: () => t("Like Ask; a model answers instead of you"),
  "smart-strict": () => t("Smart approval for every command beyond simple reads"),
  full: () => t("Tools run without approval prompts"),
};

/** What the Full access confirmation lists (composer and Settings alike). */
export function fullAccessConsequences(): string[] {
  return [
    t("Bypasses the security extension's command blocks and approvals"),
    t("Bypasses credential-path access limits"),
    t("Approval prompts and writable-folder checks for external reads and writes are skipped"),
    t("Network access limits are skipped"),
    t("Two brakes stay on: deleting or moving your home, top-level or project folders, and changing system folders"),
    t("Branches, side conversations and subagents start with smart approval instead"),
  ];
}
