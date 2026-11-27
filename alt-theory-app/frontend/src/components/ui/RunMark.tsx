/**
 * The running mark (owner 2026-11-26): the logo's mountain as a faint
 * triangle with a light travelling round it, in place of a spinning ring.
 * The light is a cone drawn once and only rotated (owner 2026-11-27): a
 * rotation runs on the compositor, while a moving dash restyles the page
 * every frame and makes the browser repaint every highlighted passage.
 */
export function RunMark() {
  return (
    <span className="run-mark" aria-hidden="true">
      <span className="run-mark-line run-mark-base" />
      <span className="run-mark-line"><i /></span>
    </span>
  );
}
