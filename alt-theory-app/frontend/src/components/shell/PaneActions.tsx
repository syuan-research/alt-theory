import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The right pane head's slot for what the thing on show can do (owner
 *  2026-11-27): one group at the top right, beside Full width, instead of
 *  buttons in each item's own row. */
export const PaneActionsHost = createContext<HTMLElement | null>(null);

export function PaneActions({ children }: { children: ReactNode }) {
  const host = useContext(PaneActionsHost);
  return host ? createPortal(children, host) : null;
}
