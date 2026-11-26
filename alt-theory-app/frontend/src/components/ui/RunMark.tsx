/**
 * The running mark (owner 2026-11-26): the logo's mountain as a faint
 * triangle with a short stroke travelling round it, in place of a spinning
 * ring.
 */
export function RunMark() {
  return (
    <svg className="run-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path className="run-mark-base" d="M8 2.6 14 13.4H2Z" />
      <path className="run-mark-trace" d="M8 2.6 14 13.4H2Z" pathLength={100} />
    </svg>
  );
}
