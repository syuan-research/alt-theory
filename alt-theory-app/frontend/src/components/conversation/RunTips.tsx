import { useEffect, useState } from "react";
import {
  GENERAL_TIPS,
  actionTipText,
  productTipText,
} from "@/config/productTips";

/**
 * Tips above the composer while a turn runs (alpha.6). Waiting is when a user
 * has attention to spare, so this is where the app says what it can do — but
 * only things that already exist and that the user drives themselves. Nothing
 * here describes behavior that switches itself on.
 */
/** Shown right after the action that produced it, then rotation takes over. */
export const SITUATIONAL_TIPS = {
  branch: () => actionTipText("branch"),
  retry: () => actionTipText("retry"),
};

const FIRST_DELAY_MS = 2000;
/** Owner: +3s so tips are readable while a turn runs (was 7s). */
const ROTATE_MS = 10000;

export function RunTips({
  running,
  seedTip,
}: {
  running: boolean;
  seedTip?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!running) {
      setVisible(false);
      return;
    }
    // Short turns should not flash a tip at all.
    const start = window.setTimeout(() => {
      setIndex(Math.floor(Math.random() * GENERAL_TIPS.length));
      setVisible(true);
    }, FIRST_DELAY_MS);
    return () => window.clearTimeout(start);
  }, [running]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % GENERAL_TIPS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [visible]);

  const text = seedTip ?? (visible ? productTipText(GENERAL_TIPS[index]) : null);
  if (!text) return null;

  // Stable key: remounting on every tip change re-ran tip-in and could nudge
  // the composer-notes band. Swap text in place instead.
  return (
    <span className="run-tip">
      <i className="ph ph-lightbulb" aria-hidden="true" />
      {text}
    </span>
  );
}
