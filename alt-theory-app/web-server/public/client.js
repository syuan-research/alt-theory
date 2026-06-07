/**
 * Alt Theory — Frontend Client
 *
 * Vanilla JS WebSocket client with three-area layout:
 *   left: session/config
 *   center: chat
 *   right: runtime inspector
 *
 * REST discovery populates KB and profile selectors.
 * WebSocket handles all live session state, streaming, tools, and metrics.
 */

// ---------------------------------------------------------------------------
// DOM refs — Left panel
// ---------------------------------------------------------------------------

const newSessionBtn = document.getElementById("new-session-btn");
const sessionIdEl = document.getElementById("session-id");
const sessionStatusEl = document.getElementById("session-status");
const kbSelect = document.getElementById("kb-select");
const profileSelect = document.getElementById("profile-select");
const providerInfoEl = document.getElementById("provider-info");

// ---------------------------------------------------------------------------
// DOM refs — Chat
// ---------------------------------------------------------------------------

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stop");
const toolStatusEl = document.getElementById("tool-status");

// ---------------------------------------------------------------------------
// DOM refs — Right panel (runtime inspector)
// ---------------------------------------------------------------------------

const rtSessionId = document.getElementById("rt-session-id");
const rtConnStatus = document.getElementById("rt-conn-status");
const rtKb = document.getElementById("rt-kb");
const rtProfile = document.getElementById("rt-profile");
const rtModel = document.getElementById("rt-model");
const rtProvider = document.getElementById("rt-provider");
const rtTurns = document.getElementById("rt-turns");
const rtMessages = document.getElementById("rt-messages");
const rtToolCalls = document.getElementById("rt-tool-calls");
const rtTokInput = document.getElementById("rt-tok-input");
const rtTokOutput = document.getElementById("rt-tok-output");
const rtTokCacheR = document.getElementById("rt-tok-cache-r");
const rtTokCacheW = document.getElementById("rt-tok-cache-w");
const rtTokTotal = document.getElementById("rt-tok-total");
const rtCtxTokens = document.getElementById("rt-ctx-tokens");
const rtCtxWindow = document.getElementById("rt-ctx-window");
const rtCtxPct = document.getElementById("rt-ctx-pct");
const rtCost = document.getElementById("rt-cost");
const rtPaths = document.getElementById("rt-paths");
const rtCoreSoul = document.getElementById("rt-core-soul");
const refreshMetricsBtn = document.getElementById("refresh-metrics");

// ---------------------------------------------------------------------------
// DOM refs — Mobile / overlay / dialog
// ---------------------------------------------------------------------------

const mobileBar = document.getElementById("mobile-bar");
const toggleLeftBtn = document.getElementById("toggle-left");
const toggleRightBtn = document.getElementById("toggle-right");
const leftPanel = document.getElementById("left-panel");
const rightPanel = document.getElementById("right-panel");
const overlay = document.getElementById("overlay");
const confirmDialog = document.getElementById("confirm-dialog");
const confirmMessage = document.getElementById("confirm-message");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentAssistantEl = null;
let isRunning = false;
let hasMessages = false;
let currentSessionId = "";
let currentDomain = "";
let currentProfileSlug = "";
let sessionReady = false;
let latestManifest = null;
let pendingConfirmAction = null;
let activeToolNames = {};  // callId -> { name, el }

// ---------------------------------------------------------------------------
// REST discovery
// ---------------------------------------------------------------------------

async function fetchDiscovery() {
  try {
    const [profilesRes, domainsRes] = await Promise.all([
      fetch("/api/profiles"),
      fetch("/api/kb-domains"),
    ]);

    const profiles = profilesRes.ok ? (await profilesRes.json()).profiles : [];
    const domains = domainsRes.ok ? (await domainsRes.json()).domains : [];

    populateSelect(kbSelect, domains, "ep-core");
    populateSelect(profileSelect, profiles, "default");
    syncSessionSelectors();
    setControlsEnabled(!isRunning);
  } catch (err) {
    console.error("[discovery] Failed:", err);
    kbSelect.innerHTML = '<option value="">Error loading</option>';
    profileSelect.innerHTML = '<option value="">Error loading</option>';
    kbSelect.dataset.hasOptions = "false";
    profileSelect.dataset.hasOptions = "false";
    setControlsEnabled(!isRunning);
  }
}

function populateSelect(select, items, defaultSlug) {
  select.innerHTML = "";
  select.dataset.hasOptions = String(items.length > 0);
  if (items.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— none found —";
    select.appendChild(opt);
    return;
  }
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.slug;
    opt.textContent = item.displayName;
    if (item.slug === defaultSlug) opt.selected = true;
    select.appendChild(opt);
  }
}

function selectIfAvailable(select, value) {
  if (!value) return;
  const hasValue = Array.from(select.options).some((option) => option.value === value);
  if (hasValue) select.value = value;
}

function syncSessionSelectors() {
  selectIfAvailable(kbSelect, currentDomain);
  selectIfAvailable(profileSelect, currentProfileSlug);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function fmtNum(n) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function copyToClipboard(text, el) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (el) {
        el.classList.add("copied");
        setTimeout(() => el.classList.remove("copied"), 1200);
      }
    }).catch(() => {});
  } else {
    // Fallback for insecure contexts (plain HTTP, not localhost)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); if (el) { el.classList.add("copied"); setTimeout(() => el.classList.remove("copied"), 1200); } } catch (_) {}
    document.body.removeChild(ta);
  }
}

function collapsePath(p) {
  if (!p) return "—";
  // Show last 3 segments, with "…" prefix if longer
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 4) return p;
  return "…/" + parts.slice(-3).join("/");
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

const proto = location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${proto}//${location.host}`);

ws.onopen = () => {
  console.log("[ws] Connected");
  setConnStatus("idle", "Connected");
  fetchDiscovery();
};

ws.onclose = () => {
  console.log("[ws] Disconnected");
  finalizeStaleTools(false);
  setConnStatus("disconnected", "Disconnected");
  sessionReady = false;
  isRunning = false;
  setControlsEnabled(false);
  activeToolNames = {};
  currentAssistantEl = null;
  toolStatusEl.textContent = "Disconnected";
  sessionStatusEl.textContent = "Disconnected";
};

ws.onerror = (err) => {
  console.error("[ws] Error", err);
  setConnStatus("error", "Connection error");
};

// ---------------------------------------------------------------------------
// Connection status display
// ---------------------------------------------------------------------------

function setConnStatus(status, label) {
  rtConnStatus.innerHTML = `<span class="status-dot ${status}"></span>`;
  rtConnStatus.appendChild(document.createTextNode(label || status));
}

// ---------------------------------------------------------------------------
// Render metadata in runtime inspector
// ---------------------------------------------------------------------------

function renderManifest(manifest) {
  latestManifest = manifest;
  if (!manifest) return;

  // Session ID
  currentSessionId = manifest.sessionId;
  rtSessionId.textContent = manifest.sessionId;
  rtSessionId.title = manifest.sessionId;
  rtSessionId.onclick = () => copyToClipboard(manifest.sessionId, rtSessionId);

  // KB / Profile
  rtKb.textContent = manifest.kbDomain || "—";
  rtProfile.textContent = manifest.profilePath
    ? manifest.profilePath.split(/[/\\]/).pop().replace(/\.md$/, "")
    : "—";

  // Model / Provider
  const model = manifest.model || "—";
  const provider = manifest.provider || "—";
  rtModel.textContent = model;
  rtProvider.textContent = provider;
  providerInfoEl.textContent = `${model} (${provider})`;

  // Paths
  renderPaths(manifest);

  // Core-soul modules
  renderCoreSoul(manifest.coreSoul);
}

function renderPaths(manifest) {
  rtPaths.innerHTML = "";
  const pathEntries = [
    ["Workspace", manifest.sessionCwd],
    ["History", manifest.piSessionDir],
    ["Session File", manifest.piSessionFile],
    ["Records", manifest.recordsDir],
    ["Write Dir", manifest.writeDir],
    ["Profile", manifest.profilePath],
    ["Runtime", manifest.runtimeDir],
    ["Core-Soul", manifest.coreSoul?.basePath],
  ];
  for (const [label, path] of pathEntries) {
    if (!path) continue;
    const row = document.createElement("div");
    row.className = "path-row";
    const lbl = document.createElement("div");
    lbl.className = "path-label";
    lbl.textContent = label;
    const val = document.createElement("div");
    val.className = "path-value";
    val.textContent = collapsePath(path);
    val.title = path;
    val.onclick = () => copyToClipboard(path, val);
    row.appendChild(lbl);
    row.appendChild(val);
    rtPaths.appendChild(row);
  }
  if (rtPaths.children.length === 0) {
    rtPaths.textContent = "—";
  }
}

function renderCoreSoul(coreSoul) {
  rtCoreSoul.innerHTML = "";
  if (!coreSoul || !coreSoul.modules || coreSoul.modules.length === 0) {
    rtCoreSoul.textContent = "—";
    return;
  }
  for (const mod of coreSoul.modules) {
    const el = document.createElement("div");
    el.className = "core-soul-module";
    el.innerHTML = `<div class="cs-slug">${escHtml(mod.slug)}</div>` +
      `<div class="cs-var">${escHtml(mod.variable)}</div>` +
      `<div class="cs-value">${escHtml(mod.value)}</div>`;
    rtCoreSoul.appendChild(el);
  }
}

function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Render metrics in runtime inspector
// ---------------------------------------------------------------------------

function renderMetrics(metrics) {
  if (!metrics) return;

  rtTurns.textContent = fmtNum(metrics.turnCount);
  rtMessages.textContent = fmtNum(metrics.messageCount);
  rtToolCalls.textContent = fmtNum(metrics.toolCallCount);

  const tok = metrics.tokens;
  rtTokInput.textContent = fmtNum(tok?.input);
  rtTokOutput.textContent = fmtNum(tok?.output);
  rtTokCacheR.textContent = fmtNum(tok?.cacheRead);
  rtTokCacheW.textContent = fmtNum(tok?.cacheWrite);
  rtTokTotal.textContent = fmtNum(tok?.total);

  const ctx = metrics.contextUsage;
  if (ctx) {
    rtCtxTokens.textContent = fmtNum(ctx.tokens);
    rtCtxWindow.textContent = fmtNum(ctx.contextWindow);
    rtCtxPct.textContent = ctx.percent != null ? `${ctx.percent.toFixed(1)}%` : "—";
  } else {
    rtCtxTokens.textContent = "—";
    rtCtxWindow.textContent = "—";
    rtCtxPct.textContent = "—";
  }

  rtCost.textContent = metrics.cost != null ? `$${metrics.cost.toFixed(4)}` : "—";
}

// ---------------------------------------------------------------------------
// Tool status display
// ---------------------------------------------------------------------------

const TOOL_LABELS = {
  read: "Reading knowledge base…",
  grep: "Searching for relevant theories…",
  find: "Locating files…",
  ls: "Listing resources…",
  write: "Writing notes…",
};

function toolLabel(name) {
  return TOOL_LABELS[name] || `${name}…`;
}

/** Finalize any tool indicators that never received tool_finished. */
function finalizeStaleTools(success = true) {
  for (const callId of Object.keys(activeToolNames)) {
    const entry = activeToolNames[callId];
    if (entry?.el) {
      entry.el.className = `message tool-status ${success ? "finished" : "failed"}`;
      entry.el.textContent = `${success ? "✓" : "✗"} ${toolLabel(entry.name)}`;
    }
  }
}

/** Send a WebSocket message only if the connection is open. */
function wsSafeSend(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
    return true;
  }
  toolStatusEl.textContent = "⚠ Not connected";
  return false;
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

ws.onmessage = (event) => {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    const errEl = document.createElement("div");
    errEl.className = "message error";
    errEl.textContent = "Received malformed message from server.";
    messagesEl.appendChild(errEl);
    return;
  }

  switch (msg.type) {
    // --- Session lifecycle ---
    case "session_opened":
      currentSessionId = msg.payload.sessionId;
      currentDomain = msg.payload.currentDomain || "";
      currentProfileSlug = msg.payload.profileSlug || "";
      sessionReady = true;
      isRunning = false;
      sessionIdEl.textContent = `Session: ${msg.payload.sessionId.slice(0, 8)}…`;
      sessionStatusEl.textContent = "Ready";
      rtKb.textContent = currentDomain || "—";
      rtProfile.textContent = currentProfileSlug || "—";
      syncSessionSelectors();
      setControlsEnabled(true);
      setConnStatus("idle", "Ready");
      console.log("[ws] Session opened:", msg.payload.sessionId);
      break;

    case "session_updated":
      if (msg.payload.status === "running") {
        setConnStatus("running", "Running");
        sessionStatusEl.textContent = "Running…";
      } else {
        setConnStatus("idle", msg.payload.status || "Ready");
        sessionStatusEl.textContent = msg.payload.status || "Ready";
      }
      currentDomain = msg.payload.currentDomain || currentDomain;
      currentProfileSlug = msg.payload.profileSlug || currentProfileSlug;
      rtKb.textContent = currentDomain || rtKb.textContent;
      rtProfile.textContent = currentProfileSlug || rtProfile.textContent;
      syncSessionSelectors();
      break;

    case "session_metadata":
      renderManifest(msg.payload);
      break;

    case "session_metrics":
      renderMetrics(msg.payload);
      break;

    // --- Streaming text ---
    case "assistant_delta": {
      if (!currentAssistantEl) {
        currentAssistantEl = document.createElement("div");
        currentAssistantEl.className = "message assistant";
        messagesEl.appendChild(currentAssistantEl);
      }
      currentAssistantEl.textContent += msg.payload.text;
      break;
    }

    // --- Tool calls ---
    case "tool_started": {
      const { toolName, callId } = msg.payload;
      const label = toolLabel(toolName);

      // Inline tool indicator in chat
      const toolEl = document.createElement("div");
      toolEl.className = "message tool-status";
      toolEl.textContent = `⏳ ${label}`;
      toolEl.dataset.callId = callId;
      messagesEl.appendChild(toolEl);
      activeToolNames[callId] = { name: toolName, el: toolEl };

      // Composer tool bar
      toolStatusEl.textContent = `⏳ ${label}`;
      break;
    }

    case "tool_updated": {
      const entry = activeToolNames[msg.payload.callId];
      if (entry?.el) {
        // Keep showing, maybe update progress text if provided
        if (msg.payload.text) {
          entry.el.textContent = `⏳ ${toolLabel(entry.name)} — ${msg.payload.text}`;
        }
      }
      break;
    }

    case "tool_finished": {
      const entry = activeToolNames[msg.payload.callId];
      if (entry?.el) {
        const success = msg.payload.success;
        entry.el.className = `message tool-status ${success ? "finished" : "failed"}`;
        entry.el.textContent = `${success ? "✓" : "✗"} ${toolLabel(entry.name)}`;
      }
      delete activeToolNames[msg.payload.callId];
      // Clear composer tool status if no more active tools
      if (Object.keys(activeToolNames).length === 0) {
        toolStatusEl.textContent = "";
      }
      break;
    }

    // --- Run completion ---
    case "run_completed": {
      // Finalize any tool indicators that never got tool_finished
      finalizeStaleTools();
      currentAssistantEl = null;
      isRunning = false;
      hasMessages = true;
      setControlsEnabled(true);
      setConnStatus("idle", "Ready");
      sessionStatusEl.textContent = "Ready";
      toolStatusEl.textContent = "";
      activeToolNames = {};
      break;
    }

    case "run_failed": {
      finalizeStaleTools(false);
      const errEl = document.createElement("div");
      errEl.className = "message error";
      errEl.textContent = `Run failed: ${msg.payload.error}`;
      messagesEl.appendChild(errEl);
      currentAssistantEl = null;
      isRunning = false;
      setControlsEnabled(true);
      setConnStatus("error", "Error");
      sessionStatusEl.textContent = "Error";
      toolStatusEl.textContent = "";
      activeToolNames = {};
      break;
    }

    case "error": {
      const errEl = document.createElement("div");
      errEl.className = "message error";
      errEl.textContent = msg.payload.error;
      messagesEl.appendChild(errEl);
      // Also show in composer tool status
      toolStatusEl.textContent = `⚠ ${msg.payload.error}`;
      break;
    }
  }

  // Auto-scroll only if user is near the bottom
  autoScroll();
};

// ---------------------------------------------------------------------------
// Auto-scroll
// ---------------------------------------------------------------------------

function autoScroll() {
  const el = messagesEl;
  const threshold = 80;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  if (nearBottom) {
    el.scrollTop = el.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Control state management
// ---------------------------------------------------------------------------

function setControlsEnabled(enabled) {
  const connected = ws.readyState === WebSocket.OPEN;
  const interactive = enabled && sessionReady && connected;
  sendBtn.style.display = isRunning ? "none" : "inline";
  stopBtn.style.display = isRunning ? "inline" : "none";
  sendBtn.disabled = !interactive;
  stopBtn.disabled = !isRunning || !connected;
  inputEl.disabled = !interactive;
  newSessionBtn.disabled = !interactive;
  refreshMetricsBtn.disabled = !interactive;
  kbSelect.disabled = !interactive || kbSelect.dataset.hasOptions !== "true";
  profileSelect.disabled = !interactive || profileSelect.dataset.hasOptions !== "true";
}

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isRunning) return;

  if (!wsSafeSend(JSON.stringify({ type: "prompt", payload: text }))) return;

  // Render user message
  const userEl = document.createElement("div");
  userEl.className = "message user";
  userEl.textContent = text;
  messagesEl.appendChild(userEl);
  hasMessages = true;

  inputEl.value = "";

  // Toggle controls
  isRunning = true;
  setControlsEnabled(false);
  sessionStatusEl.textContent = "Thinking…";
  setConnStatus("running", "Thinking…");
}

sendBtn.onclick = sendMessage;

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Stop generation
stopBtn.onclick = () => {
  if (wsSafeSend(JSON.stringify({ type: "abort" }))) {
    toolStatusEl.textContent = "Stopping…";
  }
};

// KB switch — takes effect on next prompt
kbSelect.addEventListener("change", (e) => {
  if (!e.target.value) return;
  if (wsSafeSend(JSON.stringify({ type: "switch_kb", payload: { domain: e.target.value } }))) {
    currentDomain = e.target.value;
    rtKb.textContent = currentDomain;
  }
});

// Profile switch — takes effect on next new session
profileSelect.addEventListener("change", (e) => {
  if (!e.target.value) return;
  wsSafeSend(JSON.stringify({ type: "switch_profile", payload: { profileSlug: e.target.value } }));
});

// New session — confirm if chat has messages
newSessionBtn.onclick = () => {
  if (isRunning) return;
  if (hasMessages) {
    showConfirm(
      "Start a new session? Current chat will be cleared.",
      doNewSession
    );
  } else {
    doNewSession();
  }
};

function doNewSession() {
  if (!wsSafeSend(JSON.stringify({ type: "new_session" }))) return;

  // Clear chat
  messagesEl.innerHTML = "";
  currentAssistantEl = null;
  hasMessages = false;
  activeToolNames = {};
  toolStatusEl.textContent = "";

  // Disable controls during session replacement
  isRunning = true;
  setControlsEnabled(false);
  sessionStatusEl.textContent = "Replacing session…";
}

// Refresh metadata/metrics
refreshMetricsBtn.onclick = () => {
  wsSafeSend(JSON.stringify({ type: "get_session_metadata" }));
  wsSafeSend(JSON.stringify({ type: "get_session_metrics" }));
};

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function showConfirm(message, action) {
  confirmMessage.textContent = message;
  confirmDialog.classList.remove("hidden");
  pendingConfirmAction = action;
}

confirmYes.onclick = () => {
  confirmDialog.classList.add("hidden");
  if (pendingConfirmAction) {
    pendingConfirmAction();
    pendingConfirmAction = null;
  }
};

confirmNo.onclick = () => {
  confirmDialog.classList.add("hidden");
  pendingConfirmAction = null;
};

// ---------------------------------------------------------------------------
// Mobile panel toggles
// ---------------------------------------------------------------------------

function closeMobilePanels() {
  leftPanel.classList.remove("open");
  rightPanel.classList.remove("open");
  overlay.classList.remove("active");
}

toggleLeftBtn.onclick = () => {
  const isOpen = leftPanel.classList.contains("open");
  closeMobilePanels();
  if (!isOpen) {
    leftPanel.classList.add("open");
    overlay.classList.add("active");
  }
};

toggleRightBtn.onclick = () => {
  const isOpen = rightPanel.classList.contains("open");
  closeMobilePanels();
  if (!isOpen) {
    rightPanel.classList.add("open");
    overlay.classList.add("active");
  }
};

overlay.onclick = closeMobilePanels;

// ---------------------------------------------------------------------------
// Keyboard: Escape closes dialog / mobile panels
// ---------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!confirmDialog.classList.contains("hidden")) {
    confirmNo.onclick();
  } else if (leftPanel.classList.contains("open") || rightPanel.classList.contains("open")) {
    closeMobilePanels();
  }
});
