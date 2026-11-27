/** "Send to the center" (owner 2026-11-27): a split frame with an arrow
 *  leaving the right part for the left; drawn to sit with Phosphor's regular set. */
export function CenterIcon() {
  return (
    <svg className="center-icon" viewBox="0 0 256 256" aria-hidden="true">
      <rect x="28" y="48" width="200" height="160" rx="14" />
      <path d="M164 48v160M140 128H68M96 100l-28 28 28 28" />
    </svg>
  );
}
