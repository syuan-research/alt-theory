import assert from "node:assert/strict";
import { test } from "node:test";
import { t } from "@/i18n";
import { relativeTimeLabel } from "./format";

const NOW = new Date("2026-09-25T12:00:00").getTime();
const ago = (iso: string | null) => relativeTimeLabel(iso, NOW);

test("relative ladder boundaries", () => {
  // English source keys pass through t() unchanged in the test locale.
  assert.equal(ago("2026-09-25T11:59:30"), t("Just now"));
  assert.equal(ago("2026-09-25T11:01:00"), t("{count} minutes ago", { count: 59 }));
  assert.equal(ago("2026-09-25T11:00:00"), t("{count} hours ago", { count: 1 }));
  assert.equal(ago("2026-09-24T12:00:01"), t("{count} hours ago", { count: 23 }));
  assert.equal(ago("2026-09-24T12:00:00"), t("{count} days ago", { count: 1 }));
  assert.equal(ago("2026-09-19T12:00:00"), t("{count} days ago", { count: 6 }));
  assert.equal(ago("2026-09-18T12:00:00"), t("{count} weeks ago", { count: 1 }));
});

test("weeks stop at four, months are calendar-complete", () => {
  // Sep 25 minus 30 days = Aug 26: 0 complete months, 30 days -> 4 weeks.
  assert.equal(ago("2026-08-26T12:00:00"), t("{count} weeks ago", { count: 4 }));
  // One second shy of the month boundary stays in weeks; exactly 31 days
  // is a complete calendar month -> never "5 weeks".
  assert.equal(ago("2026-08-25T12:00:01"), t("{count} weeks ago", { count: 4 }));
  assert.equal(ago("2026-08-25T12:00:00"), t("{count} months ago", { count: 1 }));
  // Month arithmetic is calendar, not 30-day blocks: Aug 26 11:59 -> Sep 25
  // 12:00 is still short of a complete month (4 weeks).
  assert.equal(ago("2026-08-26T11:59:00"), t("{count} weeks ago", { count: 4 }));
});

test("months stop at twelve, then years", () => {
  assert.equal(ago("2025-10-25T12:00:00"), t("{count} months ago", { count: 11 }));
  assert.equal(ago("2025-09-25T12:00:01"), t("{count} months ago", { count: 11 }));
  assert.equal(ago("2025-09-25T12:00:00"), t("{count} years ago", { count: 1 }));
  assert.equal(ago("2024-09-25T12:00:00"), t("{count} years ago", { count: 2 }));
});

test("future or invalid values degrade, empty stays null", () => {
  assert.equal(ago(null), null);
  assert.equal(ago(""), null);
  assert.equal(ago("not-a-date"), null);
  // Clock skew: a few seconds ahead reads as just now, never negative.
  assert.equal(ago("2026-09-25T12:00:20"), t("Just now"));
});
