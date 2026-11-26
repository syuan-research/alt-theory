import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { t } from "@/i18n";

export type DeckCard = {
  key: string;
  name: string;
  /** Phosphor icon class, e.g. "ph-user-circle". */
  icon: string;
  /** Something on this card is switched on: its spine and tray icon turn blue. */
  live?: boolean;
  tone?: "blue";
  content: ReactNode;
};

const AWAY_KEY = "alt-deck-away";
const readAway = () => {
  try { return window.localStorage.getItem(AWAY_KEY) === "1"; } catch { return false; }
};

/**
 * The cards above the composer (owner 2026-11-26, prototype "Composer Card
 * Deck"): one card in front, the others' spines on the right showing their
 * icon and, on hover, their name; a click brings one forward. The handle at
 * the front card's left end puts the deck away to the right — click it or
 * drag it right — leaving a small tray with each card's icon.
 */
export function ComposerDeck({ cards, front, onFront }: {
  cards: DeckCard[];
  front: string;
  onFront: (key: string) => void;
}) {
  const [away, setAwayState] = useState(readAway);
  const [moving, setMoving] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; moved: boolean } | null>(null);
  const firstRender = useRef(true);

  const setAway = (next: boolean) => {
    setAwayState(next);
    try { window.localStorage.setItem(AWAY_KEY, next ? "1" : "0"); } catch { /* per-device convenience only */ }
  };
  // Clip the front card's contents only while it travels, so its menus can open above it at rest.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setMoving(true);
    const timer = window.setTimeout(() => setMoving(false), 320);
    return () => window.clearTimeout(timer);
  }, [away]);

  const shown = cards.find((card) => card.key === front) ?? cards[0];
  const at = cards.indexOf(shown);
  const behind = [...cards.slice(at + 1), ...cards.slice(0, at)];

  const endDrag = (x: number) => {
    const state = drag.current;
    const el = frontRef.current;
    if (!state || !el) return;
    el.classList.remove("dragging");
    el.style.left = "";
    el.style.opacity = "";
    if (state.moved && x - state.x > state.width / 3) setAway(true);
    window.setTimeout(() => { drag.current = null; }, 0);
  };

  return (
    <div
      ref={deckRef}
      className={`deck${away ? " away" : ""}${moving ? " moving" : ""}`}
      style={{ "--n": cards.length } as CSSProperties}
    >
      {behind.map((card, k) => (
        <button
          key={card.key}
          type="button"
          className={`deck-spine${card.tone ? ` ${card.tone}` : ""}${card.live ? " live" : ""}`}
          style={{ "--k": k } as CSSProperties}
          aria-label={card.name}
          onClick={() => onFront(card.key)}
        >
          <span className="deck-spine-label">
            <i className={`ph ${card.icon}`} aria-hidden="true" />
            <span className="deck-spine-name">{card.name}</span>
          </span>
          {card.live ? <span className="deck-dot" aria-hidden="true" /> : null}
        </button>
      ))}
      <div ref={frontRef} className={`deck-front${shown.tone ? ` ${shown.tone}` : ""}`}>
        <span
          className="deck-handle"
          role="button"
          tabIndex={0}
          aria-label={t("Put away")}
          data-tip={t("Put away")}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, width: deckRef.current?.clientWidth ?? 600, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const state = drag.current;
            const el = frontRef.current;
            if (!state || !el || !(event.buttons & 1)) return;
            const dx = Math.max(0, event.clientX - state.x);
            if (dx > 3) { state.moved = true; el.classList.add("dragging"); }
            el.style.left = `${Math.min(dx, state.width - 84)}px`;
            el.style.opacity = String(1 - Math.min(dx / state.width, 0.6));
          }}
          onPointerUp={(event) => endDrag(event.clientX)}
          onPointerCancel={(event) => endDrag(event.clientX)}
          onClick={() => { if (!drag.current?.moved) setAway(true); }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setAway(true);
          }}
        />
        <div className="deck-content" key={shown.key}>{shown.content}</div>
      </div>
      <div className="deck-tray">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={card.live ? "live" : undefined}
            aria-label={card.name}
            data-tip={card.name}
            tabIndex={away ? 0 : -1}
            onClick={() => { onFront(card.key); setAway(false); }}
          >
            <i className={`ph ${card.icon}`} aria-hidden="true" />
            {card.live ? <span className="deck-dot" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
