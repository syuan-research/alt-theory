// ui-only.js — Alt Theory baseline mockup interactions.
// Pure local behavior. NO networking of any kind
// (no fetch / XMLHttpRequest / WebSocket / EventSource / dynamic server imports).
// Mirrors real client.js pane-state (applyPaneState ~1777-1782) and right-tab
// selection (~1750-1758): tabs use `selected`, panels use `active`.

(function () {
  "use strict";
  var docEl = document.documentElement;
  var leftPanel = document.getElementById("left-panel");
  var rightPanel = document.getElementById("right-panel");
  var leftResizer = document.getElementById("left-resizer");
  var rightResizer = document.getElementById("right-resizer");
  var restoreLeft = document.getElementById("restore-left");
  var restoreRight = document.getElementById("restore-right");

  // 1) Panel collapse / expand (mirrors applyPaneState at client.js:1777-1782).
  function setCollapsed(side, collapsed) {
    var panel = side === "left" ? leftPanel : rightPanel;
    var resizer = side === "left" ? leftResizer : rightResizer;
    var restore = side === "left" ? restoreLeft : restoreRight;
    if (panel) panel.classList.toggle("collapsed", collapsed);
    if (resizer) resizer.classList.toggle("hidden", collapsed);
    if (restore) restore.classList.toggle("visible", collapsed);
  }
  function bindToggle(id, side, collapsed) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", function () { setCollapsed(side, collapsed); });
  }
  bindToggle("collapse-left", "left", true);
  bindToggle("collapse-right", "right", true);
  bindToggle("restore-left", "left", false);
  bindToggle("restore-right", "right", false);

  // 2) Right-panel tab switching (mirrors client.js:1750-1758).
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".right-tab"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".right-tab-panel"));
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var key = tab.dataset.rightTab;
      tabs.forEach(function (t) { t.classList.toggle("selected", t === tab); });
      panels.forEach(function (p) { p.classList.toggle("active", p.dataset.rightPanel === key); });
    });
  });

  // 3) Session-row selection.
  var rows = Array.prototype.slice.call(document.querySelectorAll(".session-row"));
  rows.forEach(function (row) {
    row.addEventListener("click", function () {
      rows.forEach(function (r) { r.classList.toggle("selected", r === row); });
    });
  });

  // 4) Optional resizer drag — trivial, clean; updates --left-width / --right-width.
  function bindResizer(resizer, side, startVal, min, max, invert) {
    if (!resizer) return;
    resizer.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = startVal();
      function onMove(ev) {
        var delta = (ev.clientX - startX) * (invert ? -1 : 1);
        var w = Math.max(min, Math.min(max, startW + delta));
        docEl.style.setProperty(side === "left" ? "--left-width" : "--right-width", w + "px");
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
  bindResizer(leftResizer, "left", function () {
    return parseInt(getComputedStyle(docEl).getPropertyValue("--left-width"), 10) || 300;
  }, 220, 420, false);
  bindResizer(rightResizer, "right", function () {
    return parseInt(getComputedStyle(docEl).getPropertyValue("--right-width"), 10) || 340;
  }, 260, 460, true);
})();
