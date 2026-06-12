/**
 * Alt Theory — Frontend Client
 *
 * Vanilla JS WebSocket client with three-area layout:
 *   left: session/config
 *   center: chat
 *   right: runtime inspector
 *
 * REST discovery populates KB and role-preset selectors.
 * WebSocket handles all live session state, streaming, tools, and metrics.
 */

// ---------------------------------------------------------------------------
// DOM refs — Left panel
// ---------------------------------------------------------------------------

const newSessionBtn = document.getElementById("new-session-btn");
const sessionIdEl = document.getElementById("session-id");
const sessionStatusEl = document.getElementById("session-status");
const kbSelect = document.getElementById("kb-select");
const rolePresetSelect = document.getElementById("role-preset-select");
const providerInfoEl = document.getElementById("provider-info");
const sessionRefreshBtn = document.getElementById("session-refresh-btn");
const sessionListEl = document.getElementById("session-list");
const sessionDetailEl = document.getElementById("session-detail");
const resumeSessionBtn = document.getElementById("resume-session-btn");

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
const rtRolePreset = document.getElementById("rt-role-preset");
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
let currentRolePresetSlug = "";
let sessionReady = false;
let latestManifest = null;
let pendingConfirmAction = null;
let sessionCatalog = [];
let selectedHistoricalSessionId = "";
let selectedSessionDetail = null;
let pendingOpenSessionId = "";
let activeToolNames = {};  // callId -> { name, path, el }

// ---------------------------------------------------------------------------
// REST discovery
// ---------------------------------------------------------------------------

async function fetchDiscovery() {
  try {
    const [rolePresetsRes, domainsRes] = await Promise.all([
      fetch("/api/role-presets"),
      fetch("/api/kb-domains"),
    ]);

    const rolePresets = rolePresetsRes.ok
      ? (await rolePresetsRes.json()).rolePresets
      : [];
    const domains = domainsRes.ok ? (await domainsRes.json()).domains : [];

    populateSelect(kbSelect, domains, "ep-core");
    populateSelect(rolePresetSelect, rolePresets, "default");
    syncSessionSelectors();
    setControlsEnabled(!isRunning);
  } catch (err) {
    console.error("[discovery] Failed:", err);
    kbSelect.innerHTML = '<option value="">Error loading</option>';
    rolePresetSelect.innerHTML = '<option value="">Error loading</option>';
    kbSelect.dataset.hasOptions = "false";
    rolePresetSelect.dataset.hasOptions = "false";
    setControlsEnabled(!isRunning);
  }
}

async function fetchSessions() {
  try {
    const res = await fetch("/api/sessions");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sessionCatalog = Array.isArray(data.sessions) ? data.sessions : [];
    renderSessionList();
    if (
      selectedHistoricalSessionId &&
      sessionCatalog.some((session) => session.sessionId === selectedHistoricalSessionId)
    ) {
      await fetchSessionDetail(selectedHistoricalSessionId);
    } else if (sessionCatalog.length > 0) {
      await fetchSessionDetail(sessionCatalog[0].sessionId);
    } else {
      selectedHistoricalSessionId = "";
      selectedSessionDetail = null;
      renderSessionDetail();
    }
  } catch (err) {
    console.error("[sessions] Failed:", err);
    sessionCatalog = [];
    selectedHistoricalSessionId = "";
    selectedSessionDetail = null;
    sessionListEl.innerHTML = '<div class="session-error">Could not load sessions.</div>';
    renderSessionDetail();
  }
}

async function fetchSessionDetail(sessionId) {
  if (!sessionId) return;
  selectedHistoricalSessionId = sessionId;
  renderSessionList();
  sessionDetailEl.innerHTML = '<div class="session-empty">Loading...</div>';
  resumeSessionBtn.disabled = true;
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    selectedSessionDetail = await res.json();
    renderSessionDetail();
  } catch (err) {
    console.error("[sessions] Detail failed:", err);
    selectedSessionDetail = null;
    sessionDetailEl.innerHTML = '<div class="session-error">Could not load session detail.</div>';
    resumeSessionBtn.disabled = true;
  }
}

function renderSessionList() {
  sessionListEl.innerHTML = "";
  if (sessionCatalog.length === 0) {
    sessionListEl.innerHTML = '<div class="session-empty">No saved sessions.</div>';
    return;
  }

  for (const session of sessionCatalog) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "session-row";
    if (session.sessionId === selectedHistoricalSessionId) {
      row.classList.add("selected");
    }
    row.onclick = () => fetchSessionDetail(session.sessionId);

    const title = document.createElement("div");
    title.className = "session-row-title";
    const id = document.createElement("span");
    id.textContent = shortId(session.sessionId);
    const status = document.createElement("span");
    status.className = session.warnings?.length ? "session-warning" : "";
    status.textContent = session.status || "unknown";
    title.appendChild(id);
    title.appendChild(status);

    const meta = document.createElement("div");
    meta.className = "session-row-meta";
    meta.textContent = [
      session.kbDomain || "no-kb",
      session.rolePresetSlug || "no-role",
      formatProviderModel(session),
      fmtTime(session.updatedAt || session.createdAt),
    ].filter(Boolean).join(" | ");

    row.appendChild(title);
    row.appendChild(meta);
    sessionListEl.appendChild(row);
  }
}

function renderSessionDetail() {
  sessionDetailEl.innerHTML = "";
  const detail = selectedSessionDetail;
  if (!detail) {
    resumeSessionBtn.disabled = true;
    return;
  }

  const session = detail.session || {};
  const rows = [
    ["ID", session.sessionId || "—"],
    ["Updated", fmtTime(session.updatedAt || session.createdAt)],
    ["KB", session.kbDomain || "—"],
    ["Role", session.rolePresetSlug || "—"],
    ["Model", formatProviderModel(session) || "—"],
    ["Turns", session.turnCount ?? "—"],
    ["Messages", session.messageCount ?? "—"],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "session-detail-row";
    const key = document.createElement("div");
    key.className = "session-detail-key";
    key.textContent = label;
    const val = document.createElement("div");
    val.textContent = value;
    row.appendChild(key);
    row.appendChild(val);
    sessionDetailEl.appendChild(row);
  }

  const warnings = [
    ...(session.warnings || []),
    ...(detail.warnings || []),
  ].filter((value, index, array) => value && array.indexOf(value) === index);
  if (warnings.length > 0) {
    const warningEl = document.createElement("div");
    warningEl.className = "session-warning";
    warningEl.textContent = warnings.join(" | ");
    sessionDetailEl.appendChild(warningEl);
  }

  const previewText = renderPreviewText(detail.transcriptPreview || []);
  if (previewText) {
    const preview = document.createElement("div");
    preview.className = "session-preview";
    preview.textContent = previewText;
    sessionDetailEl.appendChild(preview);
  }

  resumeSessionBtn.disabled =
    !session.hasSessionFile || !session.sessionId || ws.readyState !== WebSocket.OPEN;
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
  selectIfAvailable(rolePresetSelect, currentRolePresetSlug);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function fmtNum(n) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

function fmtTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatProviderModel(session) {
  const model = session?.model;
  const provider = session?.provider;
  if (model && provider) return `${model} (${provider})`;
  return model || provider || "";
}

function renderPreviewText(messages) {
  return messages
    .slice(-4)
    .map((message) => {
      const role = message.role || "other";
      const text = (message.text || "").trim();
      if (!text) return "";
      return `${role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function appendChatMessage(role, text, options = {}) {
  const value = (text || "").trim();
  if (!value) return null;
  const el = document.createElement("div");
  if (role === "user") {
    el.className = "message user";
  } else if (role === "assistant") {
    el.className = "message assistant";
  } else if (role === "tool") {
    const success = options.success !== false;
    el.className = `message tool-status ${success ? "finished" : "failed"}`;
    el.textContent = `${success ? "✓" : "✗"} ${toolLabel(
      options.toolName || value,
      options.path
    )}`;
    messagesEl.appendChild(el);
    return el;
  } else {
    el.className = "message system";
  }
  el.textContent = value;
  messagesEl.appendChild(el);
  return el;
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
  fetchSessions();
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
  resumeSessionBtn.disabled = true;
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

  // KB / Role preset
  rtKb.textContent = manifest.kb?.domain || manifest.kbDomain || "—";
  rtRolePreset.textContent = manifest.rolePreset?.slug || "—";

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
    ["App Context", manifest.appContext?.path],
    ["Soul", manifest.soul?.path],
    ["Role Preset", manifest.rolePreset?.path],
    ["KB Root", manifest.kb?.rootDir],
    ["KB Domain", manifest.kb?.domainPath],
    ["Pi Prompts", manifest.piAdapter?.promptTemplatesDir],
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

function normalizePathForCompare(path) {
  return path ? path.replace(/\\/g, "/").toLowerCase() : "";
}

function pathStartsWith(path, base) {
  const normalizedPath = normalizePathForCompare(path);
  const normalizedBase = normalizePathForCompare(base);
  return Boolean(
    normalizedPath &&
      normalizedBase &&
      (normalizedPath === normalizedBase ||
        normalizedPath.startsWith(`${normalizedBase.replace(/\/$/, "")}/`))
  );
}

function isKbPath(path) {
  if (!path || !latestManifest?.kb) return false;
  return (
    pathStartsWith(path, latestManifest.kb.domainPath) ||
    pathStartsWith(path, latestManifest.kb.rootDir)
  );
}

function toolLabel(name, path) {
  const kbPath = isKbPath(path);
  if (name === "read") {
    return kbPath ? "Reading knowledge base…" : "Reading file…";
  }
  if (name === "grep") {
    return kbPath ? "Searching for relevant theories…" : "Searching files…";
  }
  if (name === "find") {
    return kbPath ? "Locating knowledge base files…" : "Locating files…";
  }
  if (name === "ls") {
    return kbPath ? "Listing knowledge base…" : "Listing resources…";
  }
  if (name === "write") return "Writing notes…";
  return `${name}…`;
}

/** Finalize any tool indicators that never received tool_finished. */
function finalizeStaleTools(success = true) {
  for (const callId of Object.keys(activeToolNames)) {
    const entry = activeToolNames[callId];
    if (entry?.el) {
      entry.el.className = `message tool-status ${success ? "finished" : "failed"}`;
      entry.el.textContent = `${success ? "✓" : "✗"} ${toolLabel(
        entry.name,
        entry.path
      )}`;
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
      if (
        pendingOpenSessionId &&
        msg.payload.sessionId === pendingOpenSessionId
      ) {
        clearChatSurface();
        pendingOpenSessionId = "";
      }
      currentSessionId = msg.payload.sessionId;
      currentDomain = msg.payload.currentDomain || "";
      currentRolePresetSlug =
        msg.payload.rolePresetSlug || msg.payload.profileSlug || "";
      sessionReady = true;
      isRunning = false;
      sessionIdEl.textContent = `Session: ${msg.payload.sessionId.slice(0, 8)}…`;
      sessionStatusEl.textContent = "Ready";
      rtKb.textContent = currentDomain || "—";
      rtRolePreset.textContent = currentRolePresetSlug || "—";
      syncSessionSelectors();
      setControlsEnabled(true);
      setConnStatus("idle", "Ready");
      console.log("[ws] Session opened:", msg.payload.sessionId);
      fetchSessions();
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
      currentRolePresetSlug =
        msg.payload.rolePresetSlug ||
        msg.payload.profileSlug ||
        currentRolePresetSlug;
      rtKb.textContent = currentDomain || rtKb.textContent;
      rtRolePreset.textContent = currentRolePresetSlug || rtRolePreset.textContent;
      syncSessionSelectors();
      break;

    case "session_metadata":
      renderManifest(msg.payload);
      break;

    case "session_metrics":
      renderMetrics(msg.payload);
      break;

    case "session_transcript": {
      clearChatSurface();
      const messages = Array.isArray(msg.payload.messages)
        ? msg.payload.messages
        : [];
      for (const message of messages) {
        appendChatMessage(message.role, message.text, {
          toolName: message.toolName,
          path: message.toolPath,
          success: message.success,
        });
      }
      hasMessages = messages.length > 0;
      currentAssistantEl = null;
      break;
    }

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
      const { toolName, callId, path } = msg.payload;
      const label = toolLabel(toolName, path);

      // Inline tool indicator in chat
      const toolEl = document.createElement("div");
      toolEl.className = "message tool-status";
      toolEl.textContent = `⏳ ${label}`;
      toolEl.dataset.callId = callId;
      messagesEl.appendChild(toolEl);
      activeToolNames[callId] = { name: toolName, path, el: toolEl };

      // Composer tool bar
      toolStatusEl.textContent = `⏳ ${label}`;
      break;
    }

    case "tool_updated": {
      const entry = activeToolNames[msg.payload.callId];
      if (entry?.el) {
        // Keep showing, maybe update progress text if provided
        if (msg.payload.text) {
          entry.el.textContent = `⏳ ${toolLabel(
            entry.name,
            entry.path
          )} — ${msg.payload.text}`;
        }
      }
      break;
    }

    case "tool_finished": {
      const entry = activeToolNames[msg.payload.callId];
      if (entry?.el) {
        const success = msg.payload.success;
        entry.el.className = `message tool-status ${success ? "finished" : "failed"}`;
        entry.el.textContent = `${success ? "✓" : "✗"} ${toolLabel(
          entry.name,
          entry.path
        )}`;
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
      if (pendingOpenSessionId) {
        pendingOpenSessionId = "";
        isRunning = false;
        sessionStatusEl.textContent = "Ready";
        setControlsEnabled(true);
      }
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
  sessionRefreshBtn.disabled = !connected;
  resumeSessionBtn.disabled =
    !interactive ||
    !selectedSessionDetail?.session?.hasSessionFile ||
    !selectedSessionDetail?.session?.sessionId;
  kbSelect.disabled = !interactive || kbSelect.dataset.hasOptions !== "true";
  rolePresetSelect.disabled =
    !interactive || rolePresetSelect.dataset.hasOptions !== "true";
}

function clearChatSurface() {
  messagesEl.innerHTML = "";
  currentAssistantEl = null;
  hasMessages = false;
  activeToolNames = {};
  toolStatusEl.textContent = "";
}

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isRunning) return;

  if (!wsSafeSend(JSON.stringify({ type: "prompt", payload: text }))) return;

  // Render user message
  appendChatMessage("user", text);
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

// Role preset switch — takes effect on next new session
rolePresetSelect.addEventListener("change", (e) => {
  if (!e.target.value) return;
  if (
    wsSafeSend(
      JSON.stringify({
        type: "switch_role_preset",
        payload: { rolePresetSlug: e.target.value },
      })
    )
  ) {
    currentRolePresetSlug = e.target.value;
    rtRolePreset.textContent = currentRolePresetSlug;
  }
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

  clearChatSurface();

  // Disable controls during session replacement
  isRunning = true;
  setControlsEnabled(false);
  sessionStatusEl.textContent = "Replacing session…";
}

sessionRefreshBtn.onclick = () => {
  fetchSessions();
};

resumeSessionBtn.onclick = () => {
  const sessionId = selectedSessionDetail?.session?.sessionId;
  if (!sessionId || isRunning) return;
  if (hasMessages) {
    showConfirm(
      "Resume selected session? Current chat view will be cleared.",
      () => doOpenSession(sessionId)
    );
  } else {
    doOpenSession(sessionId);
  }
};

function doOpenSession(sessionId) {
  pendingOpenSessionId = sessionId;
  if (
    !wsSafeSend(
      JSON.stringify({
        type: "open_session",
        payload: { sessionId },
      })
    )
  ) {
    pendingOpenSessionId = "";
    return;
  }
  isRunning = true;
  setControlsEnabled(false);
  sessionStatusEl.textContent = "Opening session…";
  toolStatusEl.textContent = "Opening selected session…";
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
