import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  separator?: boolean;
  onSelect: () => void;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const openAt = (x: number, y: number, items: ContextMenuItem[]) =>
    setMenu({ x, y, items });
  const open = (event: ReactMouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    openAt(event.clientX, event.clientY, items);
  };
  return {
    open,
    openAt,
    close: () => setMenu(null),
    element: menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null,
  };
}

function ContextMenu({ x, y, items, onClose }: MenuState & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => onClose();
    const escape = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", escape);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 228));
  const top = Math.max(8, Math.min(y, window.innerHeight - Math.min(320, items.length * 38 + 16)));
  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className={item.separator ? "context-menu-separated" : undefined}>
          <button
            type="button"
            role="menuitem"
            className={item.danger ? "danger" : undefined}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon ? <i className={`ph ${item.icon}`} aria-hidden="true" /> : null}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
