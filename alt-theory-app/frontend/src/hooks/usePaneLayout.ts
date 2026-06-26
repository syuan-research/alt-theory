import { useCallback, useEffect, useRef, useState } from "react";

const PANE_STORAGE_KEY = "alt-theory-pane-state-v06";

interface PaneState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const DEFAULT_STATE: PaneState = {
  leftWidth: 260,
  rightWidth: 300,
  leftCollapsed: false,
  rightCollapsed: false,
};

function loadPaneState(): PaneState {
  try {
    const raw = localStorage.getItem(PANE_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

export function usePaneLayout() {
  const [paneState, setPaneState] = useState<PaneState>(loadPaneState);
  const [mobilePanel, setMobilePanel] = useState<"left" | "right" | null>(
    null
  );
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  const resizeStartRef = useRef({ x: 0, leftWidth: 0, rightWidth: 0 });

  const persist = useCallback((next: PaneState) => {
    localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updatePaneState = useCallback(
    (updater: (prev: PaneState) => PaneState) => {
      setPaneState((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const collapseLeft = useCallback(() => {
    updatePaneState((prev) => ({ ...prev, leftCollapsed: true }));
  }, [updatePaneState]);

  const collapseRight = useCallback(() => {
    updatePaneState((prev) => ({ ...prev, rightCollapsed: true }));
  }, [updatePaneState]);

  const restoreLeft = useCallback(() => {
    updatePaneState((prev) => ({ ...prev, leftCollapsed: false }));
  }, [updatePaneState]);

  const restoreRight = useCallback(() => {
    updatePaneState((prev) => ({ ...prev, rightCollapsed: false }));
  }, [updatePaneState]);

  const closeMobilePanels = useCallback(() => {
    setMobilePanel(null);
  }, []);

  const toggleMobilePanel = useCallback((panel: "left" | "right") => {
    setMobilePanel((current) => (current === panel ? null : panel));
  }, []);

  const beginResize = useCallback(
    (which: "left" | "right", clientX: number) => {
      if (window.innerWidth <= 1024) return;
      resizeStartRef.current = {
        x: clientX,
        leftWidth: paneState.leftWidth,
        rightWidth: paneState.rightWidth,
      };
      setResizing(which);
    },
    [paneState.leftWidth, paneState.rightWidth]
  );

  const endResize = useCallback(() => {
    setResizing(null);
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onMove = (event: MouseEvent) => {
      const start = resizeStartRef.current;
      const delta = event.clientX - start.x;
      updatePaneState((prev) => {
        if (resizing === "left") {
          return {
            ...prev,
            leftWidth: Math.max(220, Math.min(420, start.leftWidth + delta)),
          };
        }
        return {
          ...prev,
          rightWidth: Math.max(260, Math.min(460, start.rightWidth - delta)),
        };
      });
    };

    const onUp = () => setResizing(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, updatePaneState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobilePanels();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMobilePanels]);

  return {
    paneState,
    mobilePanel,
    resizing,
    collapseLeft,
    collapseRight,
    restoreLeft,
    restoreRight,
    closeMobilePanels,
    toggleMobilePanel,
    beginResize,
    endResize,
  };
}