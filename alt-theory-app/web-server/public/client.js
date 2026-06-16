/**
 * Alt Theory — Frontend Client
 *
 * Vanilla JS WebSocket client with three-area layout:
 *   left: session/config
 *   center: chat
 *   right: runtime inspector
 *
 * REST discovery populates KB, soul, and role-preset selectors.
 * WebSocket handles all live session state, streaming, tools, and metrics.
 */

// ---------------------------------------------------------------------------
// DOM refs — Left panel
// ---------------------------------------------------------------------------

const newSessionBtn = document.getElementById("new-session-btn");
const kbSelect = document.getElementById("kb-select");
const soulSelect = document.getElementById("soul-select");
const rolePresetSelect = document.getElementById("role-preset-select");
const instructionSelect = document.getElementById("instruction-select");
const projectSelect = document.getElementById("project-select");
const sessionRefreshBtn = document.getElementById("session-refresh-btn");
const sessionSearchEl = document.getElementById("session-search");
const sessionListEl = document.getElementById("session-list");
const sessionDetailEl = document.getElementById("session-detail");
const resumeSessionBtn = document.getElementById("resume-session-btn");
const deleteSessionBtn = document.getElementById("delete-session-btn");

// ---------------------------------------------------------------------------
// DOM refs — Chat
// ---------------------------------------------------------------------------

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stop");
const toolStatusEl = document.getElementById("tool-status");
const skillSelect = document.getElementById("skill-select");
const invokeSkillBtn = document.getElementById("invoke-skill");
const reviseLatestBtn = document.getElementById("revise-latest");
const forkPurposeSelect = document.getElementById("fork-purpose");
const viewToggleBtns = Array.from(document.querySelectorAll(".view-toggle"));

// ---------------------------------------------------------------------------
// DOM refs — Right panel (runtime inspector)
// ---------------------------------------------------------------------------

const rtSessionId = document.getElementById("rt-session-id");
const rtConnStatus = document.getElementById("rt-conn-status");
const rtKb = document.getElementById("rt-kb");
const rtSoul = document.getElementById("rt-soul");
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
const recordsRefreshBtn = document.getElementById("records-refresh-btn");
const recordsListEl = document.getElementById("records-list");
const recordEditorEl = document.getElementById("record-editor");
const recordSaveBtn = document.getElementById("record-save-btn");
const recordStatusEl = document.getElementById("record-status");
const provenanceRefreshBtn = document.getElementById("provenance-refresh-btn");
const provenanceSummaryEl = document.getElementById("provenance-summary");
const provenanceRunsEl = document.getElementById("provenance-runs");
const rightTabBtns = Array.from(document.querySelectorAll(".right-tab"));
const rightTabPanels = Array.from(document.querySelectorAll(".right-tab-panel"));

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
const leftResizer = document.getElementById("left-resizer");
const rightResizer = document.getElementById("right-resizer");
const collapseLeftBtn = document.getElementById("collapse-left");
const collapseRightBtn = document.getElementById("collapse-right");
const restoreLeftBtn = document.getElementById("restore-left");
const restoreRightBtn = document.getElementById("restore-right");

// ---------------------------------------------------------------------------
// DOM refs — Auth / view mode / visibility
// ---------------------------------------------------------------------------

const loginOverlay = document.getElementById("login-overlay");
const loginForm = document.getElementById("login-form");
const loginAccountInput = document.getElementById("login-account");
const loginCodeInput = document.getElementById("login-code");
const loginSubmitBtn = document.getElementById("login-submit");
const loginErrorEl = document.getElementById("login-error");
const authBadge = document.getElementById("auth-badge");
const authBadgeMobile = document.getElementById("auth-badge-mobile");
const logoutBtn = document.getElementById("logout-btn");
const debugToggle = document.getElementById("debug-toggle");
const roleConditionSection = document.querySelector(".role-condition-section");
const roleConditionDisplay = document.getElementById("role-condition-display");
const visibilityBar = document.getElementById("visibility-bar");
const privateToggle = document.getElementById("private-toggle");
const privateBadge = document.getElementById("private-badge");
const privateExpiryHint = document.getElementById("private-expiry-hint");
const runHintEl = document.getElementById("run-hint");
const debugOnlyEls = Array.from(document.querySelectorAll(".debug-only"));
const leftConfigSection = document.querySelector(".config-section");
const sessionBrowserSection = document.getElementById("session-browser-section");
// Right-panel tabs that researcher/debug own.
const recordsTabBtn = document.querySelector('.right-tab[data-right-tab="records"]');
const pathsTabBtn = document.querySelector('.right-tab[data-right-tab="paths"]');
const provenanceTabBtn = document.querySelector('.right-tab[data-right-tab="provenance"]');
// Summary skill panel (participant + researcher/debug visible).
const summaryEditor = document.getElementById("summary-editor");
const summaryInvokeBtn = document.getElementById("summary-invoke-btn");
const summaryStatusEl = document.getElementById("summary-status");
const SUMMARY_SKILL_NAME = "conversation-summary";
const chatPanelEl = document.getElementById("chat-panel");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentAssistantEl = null;
let isRunning = false;
let hasMessages = false;
let currentSessionId = "";
let currentBranchId = "main";
let currentDomain = "";
let currentRolePresetSlug = null;
let currentSoulSlug = null;
let currentInstructionRef = null;
let currentProjectId = null;
let sessionReady = false;
let latestManifest = null;
let pendingConfirmAction = null;
let sessionCatalog = [];
let projectCatalog = [];
let selectedHistoricalSessionId = "";
let selectedSessionDetail = null;
let pendingOpenSessionId = "";
let pendingAssetSwitch = false;
let activeToolNames = {};  // callId -> { name, path, el }
let transcriptMessages = [];
let transcriptView = "developer";
let sessionRecordFiles = [];
let selectedRecordFile = null;
const NONE_VALUE = "__none__";
const PANE_STORAGE_KEY = "alt-theory-workbench-panes";
const paneState = {
  leftWidth: 264,
  rightWidth: 320,
  leftCollapsed: false,
  rightCollapsed: false,
};

// ---------------------------------------------------------------------------
// View-mode state (participant / researcher / debug)
// ---------------------------------------------------------------------------

// authCtx mirrors GET /api/auth/me -> { auth: AuthContext }.
// role: "anonymous" | "participant" | "researcher" | "admin".
let authCtx = null;
// Effective shell view: derived from role. "debug" is a client-only escalation on top of
// "researcher" and never changes server-side identity, ownership, or consent.
let viewMode = "researcher"; // default until /me resolves
let accountsConfigured = false; // whether any accounts exist server-side
let debugExpanded = false; // client-only flag for the Debug toggle
let currentVisibility = "research"; // last known draft/session visibility
const DEBUG_STORAGE_KEY = "alt-theory-debug-expanded";

// ---------------------------------------------------------------------------
// Auth + view-mode gating
// ---------------------------------------------------------------------------

// Maps a roleCondition id (e.g. "conceptual-theory") to a friendlier label for
// participant display. Backend resolves the actual role preset; we only show a label.
const ROLE_CONDITION_LABELS = {
  "conceptual-theory": "Theory companion",
  "metatheory-oriented": "Metatheory-oriented",
};

function roleConditionLabel(condition) {
  if (!condition) return "—";
  return ROLE_CONDITION_LABELS[condition] || condition;
}

function showLoginError(message) {
  if (!message) {
    loginErrorEl.classList.add("hidden");
    loginErrorEl.textContent = "";
    return;
  }
  loginErrorEl.textContent = message;
  loginErrorEl.classList.remove("hidden");
}

function setLoginGateActive(active) {
  loginOverlay.classList.toggle("hidden", !active);
  if (active) {
    loginSubmitBtn.disabled = false;
    loginAccountInput.focus();
  }
}

function renderAuthBadge() {
  const role = authCtx?.role || "anonymous";
  const label =
    role === "anonymous"
      ? ""
      : `${authCtx.displayLabel || authCtx.accountId || ""} · ${role}`;
  const titleText = label;
  for (const el of [authBadge, authBadgeMobile]) {
    if (!el) continue;
    if (!label) {
      el.classList.add("hidden");
      el.textContent = "";
      el.title = "";
    } else {
      el.textContent = label;
      el.title = titleText;
      el.classList.remove("hidden");
    }
  }
  // Show/hide the whole auth row (badge + logout) based on login state.
  const authRow = document.getElementById("auth-row");
  if (authRow) authRow.classList.toggle("hidden", role === "anonymous");
}

// Derive the shell view mode from resolved auth. Anonymous with no configured accounts
// keeps the legacy local researcher workbench (v0.4 compatibility).
function viewModeForRole(role) {
  if (role === "participant") return "participant";
  if (role === "researcher" || role === "admin") return "researcher";
  return "researcher"; // anonymous local: legacy workbench
}

// Apply section/tab gating by view mode. This is purely presentational; the backend
// remains the authorization gate for all data.
function applyViewMode(mode) {
  viewMode = mode;
  const isParticipant = mode === "participant";
  const isResearcherBase = mode === "researcher" || mode === "debug";

  // Left panel: participant hides launch/config and project row; researcher/debug show it.
  if (leftConfigSection) leftConfigSection.classList.toggle("hidden", isParticipant);
  if (projectSelect) projectSelect.parentElement &&
    (projectSelect.closest(".config-grid")?.classList.toggle("hidden", false));
  const projectRow = projectSelect?.closest(".config-grid")
    ?.querySelector('label[for="project-select"]');
  if (projectRow) projectRow.classList.toggle("hidden", isParticipant);

  // Role-condition display: participant only.
  roleConditionSection.classList.toggle("hidden", !isParticipant);

  // Debug toggle: participant only. A participant defaults to a simplified view; the
  // toggle temporarily reveals advanced inspector panels (Records/Paths/Provenance) for
  // current-browser troubleshooting. A researcher/admin already sees everything, so the
  // toggle is useless there and is hidden.
  const showDebugToggle = isParticipant;
  debugToggle.classList.toggle("hidden", !showDebugToggle);

  // Delete-from-catalog control: participant view does not expose arbitrary delete.
  // (Participant sessions are owner-scoped; soft delete stays a researcher/debug action.)
  if (deleteSessionBtn) deleteSessionBtn.classList.toggle("hidden", isParticipant);

  // Right-panel tab gating: participant keeps Runtime only (unless debug-expanded);
  // researcher sees Records/Paths/Provenance.
  const advancedTabs = [recordsTabBtn, pathsTabBtn, provenanceTabBtn].filter(Boolean);
  const showAdvanced = isResearcherBase || (isParticipant && debugExpanded);
  for (const tab of advancedTabs) tab.classList.toggle("hidden", !showAdvanced);
  for (const panel of rightTabPanels) {
    const isAdvanced = panel.dataset.rightPanel !== "runtime";
    panel.classList.toggle("hidden", isAdvanced && !showAdvanced);
  }
  // If the active right tab just got hidden, fall back. Participants land
  // on Summary (the participant-facing surface); researcher/debug land on
  // Runtime (the workbench surface).
  const activeTabBtn = rightTabBtns.find((b) => b.classList.contains("selected"));
  if (activeTabBtn && activeTabBtn.classList.contains("hidden")) {
    const fallbackTab = isParticipant ? "summary" : "runtime";
    const fallbackBtn = rightTabBtns.find(
      (b) => b.dataset.rightTab === fallbackTab
    );
    if (fallbackBtn) fallbackBtn.click();
  }

  // Transcript view toggle: participant defaults to User view and hides the toggle.
  const hideViewToggle = isParticipant;
  viewToggleBtns.forEach((b) => {
    b.classList.toggle("hidden", hideViewToggle);
  });
  if (isParticipant && transcriptView !== "user") {
    const userBtn = viewToggleBtns.find((b) => b.dataset.view === "user");
    if (userBtn) userBtn.click();
  }

  // Composer lineage row (revise button + fork-purpose) is kept hidden — revise is
  // triggered via per-message Edit + the "Send edited message" button, and fork-purpose
  // defaults to comparison without a visible selector.
  const lineageRow = document.getElementById("lineage-actions");
  if (lineageRow) lineageRow.classList.add("hidden");

  // Debug-expansion-only controls (none yet beyond tab gating).
  document.body.classList.toggle("view-participant", isParticipant);
  document.body.classList.toggle("view-researcher", isResearcherBase);
  setControlsEnabled(!isRunning);
  renderSessionList();
}

// Resolve current auth from the server and decide whether to gate behind login.
async function resolveAuthAndApply() {
  let me;
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    me = data.auth || { role: "anonymous" };
  } catch (err) {
    console.error("[auth] /me failed:", err);
    me = { role: "anonymous" };
  }
  authCtx = me;
  accountsConfigured = await detectAccountsConfigured();
  renderAuthBadge();
  roleConditionDisplay.textContent = roleConditionLabel(authCtx.defaultRoleCondition);

  const role = authCtx.role || "anonymous";
  if (role === "anonymous" && accountsConfigured) {
    // Pilot deployment with configured accounts: require app-level login.
    setLoginGateActive(true);
    applyViewMode("researcher"); // underlying shell stays neutral but gated
    return;
  }
  setLoginGateActive(false);
  const baseMode = viewModeForRole(role);
  // Debug toggle is for participants only: restore its expanded state from storage.
  debugExpanded =
    baseMode === "participant" &&
    localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  applyViewMode(baseMode);
}

// Backend returns 401 on session routes when accounts are configured, even for anonymous.
// Use that to detect configured-accounts pilot deployments without a dedicated endpoint.
async function detectAccountsConfigured() {
  try {
    const res = await fetch("/api/sessions");
    // 401 means accounts exist and anonymous is rejected.
    return res.status === 401;
  } catch {
    return false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginSubmitBtn.disabled = true;
  showLoginError("");
  const accountId = loginAccountInput.value.trim();
  const loginCode = loginCodeInput.value;
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, loginCode }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    // The WebSocket connection was established anonymously at page load. A successful
    // login sets the auth cookie, but the existing socket never re-reads it. Reload so a
    // fresh connection resolves to the authenticated identity; otherwise prompts fail
    // with "Authentication required".
    location.reload();
  } catch (err) {
    // Server already returns a generic message; surface it verbatim without account disclosure.
    showLoginError(err.message || "Sign in failed.");
  } finally {
    loginSubmitBtn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (err) {
    console.error("[auth] logout failed:", err);
  }
  debugExpanded = false;
  localStorage.removeItem(DEBUG_STORAGE_KEY);
  // Reload so the WebSocket re-resolves to anonymous (login gate reappears when
  // accounts are configured).
  location.reload();
}

async function handleAuthRequiredError() {
  let me = null;
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const body = await res.json();
      me = body.auth || null;
    }
  } catch (err) {
    console.error("[auth] auth_required recovery failed:", err);
  }
  if (me && me.role && me.role !== "anonymous") {
    location.reload();
    return true;
  }
  await resolveAuthAndApply();
  return false;
}

function handleDebugToggle() {
  // Debug toggle is for participants only: temporarily reveal advanced inspector panels.
  const canDebug = authCtx?.role === "participant";
  if (!canDebug) return;
  debugExpanded = !debugExpanded;
  localStorage.setItem(DEBUG_STORAGE_KEY, debugExpanded ? "1" : "0");
  debugToggle.classList.toggle("active", debugExpanded);
  // Re-apply current mode; applyViewMode reads debugExpanded for the advanced-panel rule.
  applyViewMode(viewMode);
}

loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);
debugToggle.addEventListener("click", handleDebugToggle);

// ---------------------------------------------------------------------------
// Private-mode (visibility) UI
// ---------------------------------------------------------------------------

// The visibility toggle is always editable on a live session (the backend now
// supports `switch_visibility` after materialization/resume as of the
// 2026-06-17 resume-leaf fix). `editable` is kept as a parameter for the draft
// state, but it is no longer the only thing that enables the toggle.
function syncVisibilityBar(editable) {
  const isPrivate = currentVisibility === "private";
  privateToggle.checked = isPrivate;
  // Toggle stays enabled whenever a session is live, regardless of draft vs
  // materialized. Only disable when explicitly not editable AND no session.
  privateToggle.disabled = !editable && !sessionReady;
  privateBadge.classList.toggle("hidden", !isPrivate);
  privateExpiryHint.classList.add("hidden");
  privateExpiryHint.textContent = "";
  // Subtle private-mode distinction: a slightly darker chat canvas + a badge.
  // Toggled on #chat-panel via .private-active; see style.css.
  if (chatPanelEl) chatPanelEl.classList.toggle("private-active", isPrivate);
  // The visibility bar is participant-facing and also harmless for researcher/debug,
  // but only show it once we know the effective view mode.
  const show =
    viewMode === "participant" || viewMode === "researcher" || viewMode === "debug";
  visibilityBar.classList.toggle("hidden", !show);
}

privateToggle.addEventListener("change", () => {
  if (privateToggle.disabled) return;
  const visibility = privateToggle.checked ? "private" : "research";
  if (!wsSafeSend(JSON.stringify({ type: "switch_visibility", payload: { visibility } }))) {
    // revert checkbox if the send failed
    privateToggle.checked = !privateToggle.checked;
    return;
  }
  currentVisibility = visibility;
  privateBadge.classList.toggle("hidden", visibility !== "private");
  if (visibility === "private") {
    showPrivateIntroCopy();
  }
});

// Verbatim private-mode copy from the v0.5 plan. Surfaced as a composer
// notice (mono small text at #tool-status) with a ⏏ prefix, matching the
// unified notification style. Auto-dismisses; not appended to the transcript.
function showPrivateIntroCopy() {
  setComposerNotice(
    "⏏",
    "Private sessions and files are deleted after 7 inactive days. Download anything you want to keep."
  );
}



async function fetchDiscovery() {
  try {
    const [rolePresetsRes, soulsRes, domainsRes, instructionsRes, skillsRes, projectsRes] = await Promise.all([
      fetch("/api/role-presets"),
      fetch("/api/souls"),
      fetch("/api/kb-domains"),
      fetch("/api/instruction-assets"),
      fetch("/api/skills"),
      fetch("/api/projects"),
    ]);

    const rolePresets = rolePresetsRes.ok
      ? (await rolePresetsRes.json()).rolePresets
      : [];
    const souls = soulsRes.ok ? (await soulsRes.json()).souls : [];
    const domains = domainsRes.ok ? (await domainsRes.json()).domains : [];
    const instructions = instructionsRes.ok
      ? (await instructionsRes.json()).instructions
      : [];
    const skills = skillsRes.ok ? (await skillsRes.json()).skills : [];
    projectCatalog = projectsRes.ok
      ? (await projectsRes.json()).projects || []
      : [];

    populateProjectSelect(projectCatalog, currentProjectId);
    populateSelect(kbSelect, domains, "ep-core");
    populateSelect(soulSelect, souls, currentSoulSlug, { includeNone: true });
    populateSelect(rolePresetSelect, rolePresets, currentRolePresetSlug || "default", {
      includeNone: true,
    });
    populateReferenceSelect(instructionSelect, instructions, currentInstructionRef);
    populateSkillSelect(skills);
    syncSessionSelectors();
    setControlsEnabled(!isRunning);
  } catch (err) {
    console.error("[discovery] Failed:", err);
    kbSelect.innerHTML = '<option value="">Error loading</option>';
    soulSelect.innerHTML = '<option value="">Error loading</option>';
    rolePresetSelect.innerHTML = '<option value="">Error loading</option>';
    projectSelect.innerHTML = '<option value="">Error loading</option>';
    kbSelect.dataset.hasOptions = "false";
    soulSelect.dataset.hasOptions = "false";
    rolePresetSelect.dataset.hasOptions = "false";
    projectSelect.dataset.hasOptions = "false";
    instructionSelect.dataset.hasOptions = "false";
    skillSelect.dataset.hasOptions = "false";
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
    renderProvenance(selectedSessionDetail);
  } catch (err) {
    console.error("[sessions] Detail failed:", err);
    selectedSessionDetail = null;
    sessionDetailEl.innerHTML = '<div class="session-error">Could not load session detail.</div>';
    resumeSessionBtn.disabled = true;
    renderProvenance(null);
  }
}

async function refreshCurrentTranscript() {
  if (!currentSessionId) return;
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}`);
    if (!res.ok) return;
    const detail = await res.json();
    transcriptMessages = Array.isArray(detail.transcript) ? detail.transcript : [];
    if (transcriptMessages.length) {
      renderTranscriptMessages();
    }
  } catch (err) {
    console.error("[transcript] Refresh failed:", err);
  }
}

async function fetchSessionRecords() {
  if (!currentSessionId) {
    renderRecordsList([]);
    return;
  }
  recordsRefreshBtn.disabled = true;
  recordStatusEl.textContent = "Loading...";
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/files`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sessionRecordFiles = Array.isArray(data.files) ? data.files : [];
    renderRecordsList(sessionRecordFiles);
    recordStatusEl.textContent = sessionRecordFiles.length ? "" : "No records.";
  } catch (err) {
    console.error("[records] Failed:", err);
    sessionRecordFiles = [];
    renderRecordsList([]);
    recordStatusEl.textContent = "Could not load records.";
  } finally {
    recordsRefreshBtn.disabled = !sessionReady || !currentSessionId;
  }
}

async function openSessionRecord(file) {
  if (!currentSessionId || !file) return;
  selectedRecordFile = file;
  renderRecordsList(sessionRecordFiles);
  recordEditorEl.disabled = true;
  recordSaveBtn.disabled = true;
  recordStatusEl.textContent = "Opening...";
  const qs = new URLSearchParams({ root: file.root, path: file.path });
  try {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(currentSessionId)}/files/content?${qs}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    selectedRecordFile = { root: data.root, path: data.path };
    recordEditorEl.value = data.content || "";
    recordEditorEl.disabled = false;
    recordSaveBtn.disabled = false;
    recordStatusEl.textContent = `${data.root}/${data.path}`;
  } catch (err) {
    console.error("[records] Open failed:", err);
    recordStatusEl.textContent = "Could not open record.";
  }
}

async function saveSessionRecord() {
  if (!currentSessionId || !selectedRecordFile) return;
  recordSaveBtn.disabled = true;
  recordStatusEl.textContent = "Saving...";
  try {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(currentSessionId)}/files/content`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: selectedRecordFile.root,
          path: selectedRecordFile.path,
          content: recordEditorEl.value,
        }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    recordStatusEl.textContent = `Saved ${data.root}/${data.path}`;
    await fetchSessionRecords();
  } catch (err) {
    console.error("[records] Save failed:", err);
    recordStatusEl.textContent = "Could not save record.";
  } finally {
    recordSaveBtn.disabled = !selectedRecordFile;
  }
}

function renderSessionList() {
  sessionListEl.innerHTML = "";
  const query = sessionSearchEl.value.trim().toLowerCase();
  const projectNames = new Map(
    projectCatalog.map((project) => [project.projectId, project.displayName])
  );
  const isParticipant = viewMode === "participant";
  const visible = sessionCatalog.filter((session) => {
    if (!query) return true;
    return [
      session.sessionId,
      projectNames.get(session.projectId) || "unassigned",
      session.rolePresetSlug,
      session.kbDomain,
      session.model,
      session.provider,
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  if (visible.length === 0) {
    sessionListEl.innerHTML = isParticipant
      ? '<div class="session-empty">No sessions yet.</div>'
      : '<div class="session-empty">No saved sessions.</div>';
    return;
  }

  // Participant view: flat list, no project grouping, low-noise meta (role + time only).
  if (isParticipant) {
    for (const session of visible) {
      sessionListEl.appendChild(
        buildSessionRow(session, {
          showModel: false,
          showKb: false,
        })
      );
    }
    return;
  }

  const groups = new Map();
  for (const session of visible) {
    const projectId = session.projectId || "";
    if (!groups.has(projectId)) groups.set(projectId, []);
    groups.get(projectId).push(session);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return (projectNames.get(a) || a).localeCompare(projectNames.get(b) || b);
  });

  for (const [projectId, sessions] of orderedGroups) {
    const group = document.createElement("section");
    group.className = "session-group";
    const heading = document.createElement("div");
    heading.className = "session-group-title";
    heading.textContent = projectId
      ? projectNames.get(projectId) || projectId
      : "Unassigned";
    group.appendChild(heading);

    for (const session of sessions) {
      group.appendChild(
        buildSessionRow(session, { showModel: true, showKb: true })
      );
    }
    sessionListEl.appendChild(group);
  }
}

function buildSessionRow(session, options = {}) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "session-row";
  if (session.sessionId === selectedHistoricalSessionId) {
    row.classList.add("selected");
  }
  if (session.visibility === "private") {
    row.classList.add("private");
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
  if (session.visibility === "private") {
    const priv = document.createElement("span");
    priv.className = "row-private-tag";
    priv.textContent = "private";
    priv.title =
      "Private sessions and files are deleted after 7 inactive days. Download anything you want to keep.";
    title.appendChild(priv);
  }
  title.appendChild(status);

  const meta = document.createElement("div");
  meta.className = "session-row-meta";
  const parts = [];
  if (options.showKb) parts.push(session.kbDomain || "no-kb");
  parts.push(session.rolePresetSlug || "no-role");
  if (options.showModel) parts.push(formatProviderModel(session));
  parts.push(fmtTime(session.updatedAt || session.createdAt));
  meta.textContent = parts.filter(Boolean).join(" | ");

  row.appendChild(title);
  row.appendChild(meta);
  return row;
}

function renderRecordsList(files) {
  recordsListEl.innerHTML = "";
  if (!files.length) {
    recordsListEl.innerHTML = '<div class="session-empty">No editable records.</div>';
    recordEditorEl.value = "";
    recordEditorEl.disabled = true;
    recordSaveBtn.disabled = true;
    selectedRecordFile = null;
    return;
  }

  for (const file of files) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "record-row";
    if (
      selectedRecordFile?.root === file.root &&
      selectedRecordFile?.path === file.path
    ) {
      row.classList.add("selected");
    }
    row.onclick = () => openSessionRecord(file);

    const path = document.createElement("span");
    path.textContent = file.path;
    const root = document.createElement("span");
    root.className = "record-root";
    root.textContent = file.root;
    row.appendChild(path);
    row.appendChild(root);
    recordsListEl.appendChild(row);
  }
}

function renderSessionDetail() {
  sessionDetailEl.innerHTML = "";
  const detail = selectedSessionDetail;
  if (!detail) {
    resumeSessionBtn.disabled = true;
    deleteSessionBtn.disabled = true;
    return;
  }

  const session = detail.session || {};
  const rows = [
    ["ID", session.sessionId || "—"],
    ["Project", projectDisplayName(session.projectId)],
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
  deleteSessionBtn.disabled = !session.sessionId || ws.readyState !== WebSocket.OPEN;
}

function populateSelect(select, items, defaultSlug, options = {}) {
  select.innerHTML = "";
  const includeNone = Boolean(options.includeNone);
  select.dataset.hasOptions = String(items.length > 0 || includeNone);

  if (includeNone) {
    const none = document.createElement("option");
    none.value = NONE_VALUE;
    none.textContent = "None";
    if (!defaultSlug) none.selected = true;
    select.appendChild(none);
  }

  if (items.length === 0 && !includeNone) {
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

function populateReferenceSelect(select, items, selectedRef) {
  select.innerHTML = '<option value="__none__">None</option>';
  select.dataset.hasOptions = "true";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.ref;
    option.textContent = item.displayName;
    option.selected = item.ref === selectedRef;
    select.appendChild(option);
  }
  if (!selectedRef) select.value = NONE_VALUE;
}

function populateProjectSelect(projects, selectedProjectId) {
  projectSelect.innerHTML = '<option value="__none__">Unassigned</option>';
  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.projectId;
    option.textContent = project.displayName;
    projectSelect.appendChild(option);
  }
  projectSelect.dataset.hasOptions = "true";
  projectSelect.value = selectedProjectId || NONE_VALUE;
}

function populateSkillSelect(skills) {
  skillSelect.innerHTML = '<option value="">Skill</option>';
  for (const skill of skills) {
    const option = document.createElement("option");
    option.value = skill.name;
    option.textContent = skill.name;
    option.title = skill.description || skill.name;
    skillSelect.appendChild(option);
  }
  skillSelect.dataset.hasOptions = String(skills.length > 0);
}

function selectIfAvailable(select, value) {
  const target = value || NONE_VALUE;
  const hasValue = Array.from(select.options).some((option) => option.value === target);
  if (hasValue) select.value = target;
}

function syncSessionSelectors() {
  selectIfAvailable(projectSelect, currentProjectId);
  selectIfAvailable(kbSelect, currentDomain);
  selectIfAvailable(soulSelect, currentSoulSlug);
  selectIfAvailable(rolePresetSelect, currentRolePresetSlug);
  selectIfAvailable(instructionSelect, currentInstructionRef);
}

function projectDisplayName(projectId) {
  if (!projectId) return "Unassigned";
  return (
    projectCatalog.find((project) => project.projectId === projectId)
      ?.displayName || projectId
  );
}

function selectedSlug(value) {
  return value && value !== NONE_VALUE ? value : null;
}

function displaySlug(value) {
  return value || "none";
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

function isInterruptedError(error) {
  return /aborted|abort|interrupted/i.test(error || "");
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

function renderTranscriptMessages() {
  messagesEl.innerHTML = "";
  // Find the latest user message index so Edit/Delete can attach to it.
  let latestUserIdx = -1;
  for (let i = transcriptMessages.length - 1; i >= 0; i--) {
    if (transcriptMessages[i].role === "user") {
      latestUserIdx = i;
      break;
    }
  }
  transcriptMessages.forEach((message, idx) => {
    renderTranscriptMessage(message, idx === latestUserIdx);
  });
  hasMessages = transcriptMessages.length > 0;
}

function renderTranscriptMessage(message, isLatest) {
  if (!message) return;
  if (transcriptView === "user") {
    if (message.role === "user" || message.role === "assistant") {
      appendChatMessage(message.role, message.text, {
        isLatest: message.role === "user" && isLatest,
        entryId: message.entryId,
      });
    }
    return;
  }

  if (message.role === "assistant" && message.thinking) {
    appendThinkingMessage(message.thinking);
  }

  if (message.role === "tool") {
    if (message.toolType === "result") {
      if (transcriptView === "developer") {
        appendToolResultMessage(message);
      }
      return;
    }
    appendChatMessage("tool", message.text, {
      toolName: message.toolName,
      path: message.toolPath,
      success: message.success,
    });
    return;
  }

  appendChatMessage(message.role, message.text, {
    isLatest: message.role === "user" && isLatest,
    entryId: message.entryId,
  });
}

function appendChatMessage(role, text, options = {}) {
  const value = (text || "").trim();
  if (!value) return null;
  const el = document.createElement("div");
  if (role === "user") {
    el.className = "message user";
    el.innerHTML = renderMarkdown(value);
    // Attach per-message conversation actions below the message text.
    // Edit/Delete are only valid on the latest user turn (backend constraint).
    // Branch is valid on any user turn.
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    if (options.isLatest) {
      const editBtn = document.createElement("button");
      editBtn.className = "msg-btn";
      editBtn.textContent = "✎ Edit";
      editBtn.title = "Edit this message";
      editBtn.onclick = (e) => {
        e.stopPropagation();
        startEditLatest(value);
      };
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "msg-btn";
      delBtn.textContent = "🗑 Delete";
      delBtn.title = "Delete this message and its reply";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (isRunning || !currentSessionId || !hasMessages) return;
        showConfirm(
          "Please confirm you want to remove the latest message and its reply.",
          doDeleteLatest,
          "Delete"
        );
      };
      actions.appendChild(delBtn);
    }

    const branchBtn = document.createElement("button");
    branchBtn.className = "msg-btn";
    branchBtn.textContent = "⑂ Branch";
    branchBtn.title = "Create a branch starting from this message";
    branchBtn.onclick = (e) => {
      e.stopPropagation();
      if (isRunning || !currentSessionId) return;
      const purpose = forkPurposeSelect.value;
      showConfirm(
        "Create a branch starting from this message?",
        () => doBranchFromMessage(options.entryId, purpose),
        "Branch"
      );
    };
    actions.appendChild(branchBtn);

    el.appendChild(actions);
    messagesEl.appendChild(el);
    return el;
  } else if (role === "assistant") {
    el.className = "message assistant";
    el.innerHTML = renderMarkdown(value);
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
  if (role !== "user" && role !== "assistant") {
    el.textContent = value;
  }
  messagesEl.appendChild(el);
  return el;
}

function renderProvenance(detail) {
  provenanceSummaryEl.innerHTML = "";
  provenanceRunsEl.innerHTML = "";
  if (!detail) {
    provenanceSummaryEl.innerHTML = '<div class="session-empty">No session selected.</div>';
    provenanceRunsEl.innerHTML = '<div class="session-empty">No run history.</div>';
    return;
  }
  const effective = detail.effectiveConfig || {};
  const warnings = [
    ...(detail.session?.warnings || []),
    ...(detail.warnings || []),
  ].filter((value, index, array) => value && array.indexOf(value) === index);
  const summaryItems = [
    ["Project", projectDisplayName(detail.session?.projectId)],
    ["Branch", detail.activeBranch?.branchId || "main"],
    ["Workspace", detail.activeBranch?.workspaceMode || "shared"],
    ["Role", effective.rolePresetSlug || "none"],
    ["Soul", effective.soulSlug || "none"],
    ["KB", effective.kbDomain || "all"],
    ["Instruction", effective.customInstruction?.ref || "none"],
    ["Warnings", warnings.length ? warnings.join(" | ") : "none"],
  ];
  for (const [label, value] of summaryItems) {
    provenanceSummaryEl.appendChild(buildProvenanceItem(label, value));
  }

  const runs = Array.isArray(detail.runs) ? detail.runs.slice(-8).reverse() : [];
  if (runs.length === 0) {
    provenanceRunsEl.innerHTML = '<div class="session-empty">No run history.</div>';
    return;
  }
  for (const run of runs) {
    provenanceRunsEl.appendChild(
      buildProvenanceItem(
        `${run.status} ${run.runId}`,
        `${run.branchId} | ${run.turnId} | ${run.revisionId}`
      )
    );
  }
}

function buildProvenanceItem(label, value) {
  const item = document.createElement("div");
  item.className = "provenance-item";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const body = document.createElement("div");
  body.textContent = value || "—";
  item.appendChild(strong);
  item.appendChild(body);
  return item;
}

function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const markedApi = window.marked;
  const rawHtml = markedApi?.parse
    ? markedApi.parse(escaped, {
        breaks: true,
        gfm: true,
      })
    : `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
  return sanitizeRenderedHtml(rawHtml);
}

function sanitizeRenderedHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("*").forEach((node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!/^(https?:|mailto:|#)/i.test(href)) {
        node.removeAttribute("href");
      } else {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noreferrer noopener");
      }
      return;
    }
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || attr.name === "style") {
        node.removeAttribute(attr.name);
      }
    }
  });
  return template.innerHTML;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appendThinkingMessage(text) {
  const value = (text || "").trim();
  if (!value) return null;
  const el = document.createElement("div");
  el.className = "message thinking";
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = "Thinking";
  const body = document.createElement("span");
  body.textContent = value;
  el.appendChild(label);
  el.appendChild(body);
  messagesEl.appendChild(el);
  return el;
}

function appendToolResultMessage(message) {
  const el = document.createElement("details");
  el.className = "message tool-result";
  const summary = document.createElement("summary");
  summary.textContent = `Tool result: ${toolLabel(message.toolName || "tool", message.toolPath)}`;
  const pre = document.createElement("pre");
  pre.textContent = message.text || "";
  el.appendChild(summary);
  el.appendChild(pre);
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
  // Resolve app identity first; view-mode gating decides whether discovery/sessions load.
  resolveAuthAndApply().finally(() => {
    if (!loginOverlay.classList.contains("hidden")) return; // gated behind login
    fetchDiscovery();
    fetchSessions();
  });
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

  // KB / Soul / Role preset
  rtKb.textContent = manifest.kb?.domain || manifest.kbDomain || "—";
  rtSoul.textContent = displaySlug(manifest.soul?.slug);
  rtRolePreset.textContent = displaySlug(manifest.rolePreset?.slug);

  // Model / Provider
  const model = manifest.model || "—";
  const provider = manifest.provider || "—";
  rtModel.textContent = model;
  rtProvider.textContent = provider;

  // Paths
  renderPaths(manifest);

  // Core-soul modules
  renderCoreSoul(manifest.coreSoul);
}

function renderDraftSession(payload) {
  latestManifest = null;
  currentSessionId = "";
  currentBranchId = "main";
  currentDomain = payload.currentDomain || "";
  currentRolePresetSlug = payload.rolePresetSlug ?? payload.profileSlug ?? null;
  currentSoulSlug = payload.soulSlug ?? null;
  currentInstructionRef = payload.customInstructionRef ?? null;
  currentProjectId = payload.projectId ?? null;
  sessionReady = true;
  isRunning = false;
  pendingAssetSwitch = false;
  pendingOpenSessionId = "";

  rtSessionId.textContent = "draft";
  rtSessionId.title = "Draft session";
  rtSessionId.onclick = null;
  currentVisibility = payload.visibility || "research";
  syncVisibilityBar(true); // draft: private toggle is editable
  rtKb.textContent = currentDomain || "—";
  rtSoul.textContent = displaySlug(currentSoulSlug);
  rtRolePreset.textContent = displaySlug(currentRolePresetSlug);
  rtModel.textContent = "—";
  rtProvider.textContent = "—";
  rtTurns.textContent = "—";
  rtMessages.textContent = "—";
  rtToolCalls.textContent = "—";
  rtTokInput.textContent = "—";
  rtTokOutput.textContent = "—";
  rtTokCacheR.textContent = "—";
  rtTokCacheW.textContent = "—";
  rtTokTotal.textContent = "—";
  rtCtxTokens.textContent = "—";
  rtCtxWindow.textContent = "—";
  rtCtxPct.textContent = "—";
  rtCost.textContent = "—";
  rtPaths.textContent = "—";
  rtCoreSoul.textContent = "—";
  selectedRecordFile = null;
  sessionRecordFiles = [];
  recordEditorEl.value = "";
  renderRecordsList([]);
  recordStatusEl.textContent = "No materialized session.";
  renderProvenance(null);
  syncSessionSelectors();
  setControlsEnabled(true);
  setConnStatus("idle", "Ready");
  fetchSessions();
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
  const writableRoots = Array.isArray(manifest.writableRoots)
    ? manifest.writableRoots
    : [];
  writableRoots.forEach((path, index) => {
    pathEntries.push([`Writable Root ${index + 1}`, path]);
  });
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
    case "session_draft":
      renderDraftSession(msg.payload);
      break;

    case "session_opened":
      if (
        pendingOpenSessionId &&
        msg.payload.sessionId === pendingOpenSessionId
      ) {
        clearChatSurface();
        pendingOpenSessionId = "";
      }
      if (pendingAssetSwitch) {
        clearChatSurface();
        pendingAssetSwitch = false;
      }
      currentSessionId = msg.payload.sessionId;
      currentBranchId = msg.payload.branchId || "main";
      currentDomain = msg.payload.currentDomain || "";
      currentRolePresetSlug =
        msg.payload.rolePresetSlug ?? msg.payload.profileSlug ?? null;
      currentSoulSlug = msg.payload.soulSlug ?? null;
      currentInstructionRef = msg.payload.customInstructionRef ?? null;
      currentProjectId = msg.payload.projectId ?? null;
      sessionReady = true;
      isRunning = false;
      currentVisibility = msg.payload.visibility || currentVisibility;
      syncVisibilityBar(true); // materialized but visibility stays editable (resume-leaf fix)
      rtKb.textContent = currentDomain || "—";
      rtSoul.textContent = displaySlug(currentSoulSlug);
      rtRolePreset.textContent = displaySlug(currentRolePresetSlug);
      syncSessionSelectors();
      setControlsEnabled(true);
      setConnStatus("idle", "Ready");
      selectedRecordFile = null;
      recordEditorEl.value = "";
      // Reset the Summary panel state on each session open so a prior session's
      // "summary generated" / error message does not bleed into the new one.
      if (summaryStatusEl) {
        summaryStatusEl.textContent = "";
        summaryStatusEl.classList.remove("error", "ok");
      }
      if (summaryEditor) summaryEditor.value = "";
      fetchSessionRecords();
      fetchSessionDetail(msg.payload.sessionId);
      console.log("[ws] Session opened:", msg.payload.sessionId);
      fetchSessions();
      break;

    case "session_updated":
      if (msg.payload.status === "running") {
        setConnStatus("running", "Running");
      } else {
        setConnStatus("idle", msg.payload.status || "Ready");
      }
      currentDomain = msg.payload.currentDomain || currentDomain;
      currentRolePresetSlug =
        msg.payload.rolePresetSlug ??
        msg.payload.profileSlug ??
        currentRolePresetSlug;
      currentSoulSlug = msg.payload.soulSlug ?? currentSoulSlug;
      currentInstructionRef =
        msg.payload.customInstructionRef ?? currentInstructionRef;
      currentProjectId =
        msg.payload.projectId === undefined
          ? currentProjectId
          : msg.payload.projectId;
      rtKb.textContent = currentDomain || rtKb.textContent;
      rtSoul.textContent = displaySlug(currentSoulSlug);
      rtRolePreset.textContent = displaySlug(currentRolePresetSlug);
      syncSessionSelectors();
      if (selectedHistoricalSessionId === msg.payload.sessionId) {
        fetchSessionDetail(msg.payload.sessionId);
      }
      break;

    case "session_metadata":
      renderManifest(msg.payload);
      break;

    case "session_metrics":
      renderMetrics(msg.payload);
      break;

    case "session_transcript": {
      transcriptMessages = Array.isArray(msg.payload.messages)
        ? msg.payload.messages
        : [];
      renderTranscriptMessages();
      currentAssistantEl = null;
      // delete_latest / fork_session reply with session_transcript (no run_completed).
      // Restore controls + clear transient status so the UI is not stuck "Deleting..."/
      // "Creating fork...".
      if (!isRunning) {
        setControlsEnabled(true);
        setConnStatus("idle", "Ready");
        toolStatusEl.textContent = "";
      }
      break;
    }

    // --- Streaming text ---
    case "assistant_delta": {
      if (!currentAssistantEl) {
      currentAssistantEl = document.createElement("div");
        currentAssistantEl.className = "message assistant";
        currentAssistantEl.dataset.rawText = "";
        messagesEl.appendChild(currentAssistantEl);
      }
      currentAssistantEl.dataset.rawText =
        `${currentAssistantEl.dataset.rawText || ""}${msg.payload.text}`;
      currentAssistantEl.innerHTML = renderMarkdown(
        currentAssistantEl.dataset.rawText
      );
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
      toolStatusEl.textContent = "";
      // A clean completed reply clears the stop/edit/delete hint.
      setRunHint("");
      // If a summary invocation was pending, mark it done.
      if (summaryStatusEl && summaryStatusEl.textContent) {
        summaryStatusEl.textContent = "总结已生成。";
        summaryStatusEl.classList.remove("error");
        summaryStatusEl.classList.add("ok");
      }
      activeToolNames = {};
      refreshCurrentTranscript();
      fetchSessionRecords();
      if (currentSessionId) fetchSessionDetail(currentSessionId);
      break;
    }

    case "run_failed": {
      const interrupted = isInterruptedError(msg.payload.error);
      finalizeStaleTools(false);
      // Surface failures as composer notices; the red transcript rectangle is
      // gone. Interrupted runs use no prefix (informational), real failures
      // use ⚠.
      setComposerNotice(
        interrupted ? "" : "⚠",
        (interrupted ? "Run interrupted: " : "Run failed: ") + msg.payload.error
      );
      currentAssistantEl = null;
      isRunning = false;
      setControlsEnabled(true);
      setConnStatus(interrupted ? "idle" : "error", interrupted ? "Ready" : "Error");
      // If the user stopped, keep the edit/delete hint. A real failure clears it.
      if (!interrupted) setRunHint("");
      activeToolNames = {};
      break;
    }

    case "error": {
      if (msg.payload.code === "auth_required") {
        toolStatusEl.textContent = "Please sign in to continue.";
        handleAuthRequiredError().then((handled) => {
          if (!handled) setLoginGateActive(true);
        });
        isRunning = false;
        setControlsEnabled(true);
        break;
      }
      // Backend errors surface as a single unified composer notice with the
      // ⚠ prefix and auto-dismiss. No transcript red rectangle. The Summary
      // panel still shows a persistent plain error there so the user can
      // re-read it after the composer notice fades.
      setComposerNotice("⚠", msg.payload.error);
      if (summaryStatusEl) {
        summaryStatusEl.textContent = msg.payload.error || "Skill invocation failed.";
        summaryStatusEl.classList.remove("ok");
        summaryStatusEl.classList.add("error");
      }
      // Any pending operation that set isRunning must be cleared on error, otherwise
      // the UI is permanently stuck (revise/delete/fork/branch/open/asset-switch).
      pendingOpenSessionId = "";
      pendingAssetSwitch = false;
      isRunning = false;
      setConnStatus("error", "Error");
      setControlsEnabled(true);
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
  // Send lockout: while a run is active, Send is hidden and stays disabled even if
  // this helper is called with enabled=true. The explicit `isRunning` guards in
  // sendMessage() / input Enter handler are the real lockout; this keeps the button
  // visually consistent. In revise mode, send-edited owns the slot — do not
  // touch send/stop display here; updateReviseModeUI owns that.
  if (!reviseMode) {
    sendBtn.style.display = isRunning ? "none" : "inline";
    stopBtn.style.display = isRunning ? "inline" : "none";
  }
  sendBtn.disabled = !interactive || isRunning;
  stopBtn.disabled = !isRunning || !connected;
  inputEl.disabled = !interactive || isRunning;
  newSessionBtn.disabled = !interactive;
  refreshMetricsBtn.disabled = !interactive || !currentSessionId;
  provenanceRefreshBtn.disabled = !interactive || !currentSessionId;
  recordsRefreshBtn.disabled = !interactive || !currentSessionId;
  recordSaveBtn.disabled = !interactive || !currentSessionId || !selectedRecordFile;
  sessionRefreshBtn.disabled = !connected;
  resumeSessionBtn.disabled =
    !interactive ||
    !selectedSessionDetail?.session?.hasSessionFile ||
    !selectedSessionDetail?.session?.sessionId;
  deleteSessionBtn.disabled =
    !connected || !selectedSessionDetail?.session?.sessionId;
  projectSelect.disabled =
    !interactive || projectSelect.dataset.hasOptions !== "true";
  kbSelect.disabled = !interactive || kbSelect.dataset.hasOptions !== "true";
  soulSelect.disabled =
    !interactive || soulSelect.dataset.hasOptions !== "true";
  rolePresetSelect.disabled =
    !interactive || rolePresetSelect.dataset.hasOptions !== "true";
  instructionSelect.disabled =
    !interactive || instructionSelect.dataset.hasOptions !== "true";
  skillSelect.disabled =
    !interactive || skillSelect.dataset.hasOptions !== "true";
  invokeSkillBtn.disabled = !interactive || !skillSelect.value;
  // Summary skill button mirrors the main skill-invoke gating: needs an
  // interactive live session and must be locked out while a run is active.
  if (summaryInvokeBtn) summaryInvokeBtn.disabled = !interactive || isRunning;
  reviseLatestBtn.disabled =
    !interactive || !currentSessionId || !hasMessages || !inputEl.value.trim();
  forkPurposeSelect.disabled = !interactive || !currentSessionId;
}

function clearChatSurface() {
  messagesEl.innerHTML = "";
  currentAssistantEl = null;
  hasMessages = false;
  activeToolNames = {};
  transcriptMessages = [];
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
  setRunHint("");

  // Toggle controls
  isRunning = true;
  setControlsEnabled(false);
  setConnStatus("running", "Thinking…");
}

sendBtn.onclick = sendMessage;

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (reviseMode) {
      reviseLatestBtn.click();
    } else {
      sendMessage();
    }
  }
  if (e.key === "Escape" && reviseMode) {
    reviseMode = false;
    inputEl.value = "";
    updateReviseModeUI();
  }
});

// Stop generation
stopBtn.onclick = () => {
  if (wsSafeSend(JSON.stringify({ type: "abort" }))) {
    toolStatusEl.textContent = "Stopping…";
    // Low-noise hint: after stopping, the latest turn can be edited or deleted.
    setRunHint("You can edit or delete your latest message.");
  }
};

projectSelect.addEventListener("change", (e) => {
  const projectId = selectedSlug(e.target.value);
  if (
    wsSafeSend(
      JSON.stringify({ type: "switch_project", payload: { projectId } })
    )
  ) {
    currentProjectId = projectId;
    if (currentSessionId) fetchSessions();
  }
});

// KB switch — takes effect on next prompt
kbSelect.addEventListener("change", (e) => {
  if (!e.target.value) return;
  if (wsSafeSend(JSON.stringify({ type: "switch_kb", payload: { domain: e.target.value } }))) {
    currentDomain = e.target.value;
    rtKb.textContent = currentDomain;
  }
});

function requestAssetSwitch(message, label) {
  pendingAssetSwitch = true;
  if (!wsSafeSend(JSON.stringify(message))) {
    pendingAssetSwitch = false;
    return false;
  }
  isRunning = true;
  setControlsEnabled(false);
  setConnStatus("running", "Switching...");
  toolStatusEl.textContent = label;
  return true;
}

// Soul switch — replaces the active backend session immediately
soulSelect.addEventListener("change", (e) => {
  const soulSlug = selectedSlug(e.target.value);
  if (
    requestAssetSwitch(
      { type: "switch_soul", payload: { soulSlug } },
      "Switching soul..."
    )
  ) {
    currentSoulSlug = soulSlug;
    rtSoul.textContent = displaySlug(currentSoulSlug);
  }
});

// Role preset switch — replaces the active backend session immediately
rolePresetSelect.addEventListener("change", (e) => {
  const rolePresetSlug = selectedSlug(e.target.value);
  if (
    requestAssetSwitch(
      { type: "switch_role_preset", payload: { rolePresetSlug } },
      "Switching role preset..."
    )
  ) {
    currentRolePresetSlug = rolePresetSlug;
    rtRolePreset.textContent = displaySlug(currentRolePresetSlug);
  }
});

inputEl.addEventListener("input", () => {
  setControlsEnabled(!isRunning);
  updateReviseModeUI();
});

instructionSelect.addEventListener("change", (e) => {
  const customInstructionRef = selectedSlug(e.target.value);
  if (
    requestAssetSwitch(
      { type: "switch_instruction", payload: { customInstructionRef } },
      "Switching instruction..."
    )
  ) {
    currentInstructionRef = customInstructionRef;
  }
});

skillSelect.addEventListener("change", () => {
  setControlsEnabled(!isRunning);
});

invokeSkillBtn.onclick = () => {
  const skillName = skillSelect.value;
  if (!skillName || isRunning) return;
  const userText = inputEl.value.trim();
  if (
    !wsSafeSend(
      JSON.stringify({
        type: "invoke_skill",
        payload: { skillName, ...(userText ? { userText } : {}) },
      })
    )
  ) return;
  appendChatMessage("user", userText || `Invoke ${skillName}`);
  inputEl.value = "";
  isRunning = true;
  hasMessages = true;
  setControlsEnabled(false);
  setConnStatus("running", "Thinking...");
};

// Summary skill panel: invoke the conversation-summary skill with an optional
// user note from #summary-editor. The skill name is hardcoded; the backend
// validates active Alt Theory skills and returns its own error if missing.
if (summaryInvokeBtn) {
  summaryInvokeBtn.onclick = () => {
    if (!sessionReady || isRunning) return;
    const userText = (summaryEditor?.value || "").trim();
    if (
      !wsSafeSend(
        JSON.stringify({
          type: "invoke_skill",
          payload: {
            skillName: SUMMARY_SKILL_NAME,
            ...(userText ? { userText } : {}),
          },
        })
      )
    ) {
      return;
    }
    // Surface the user's instruction (or a default marker) in the transcript
    // so the participant sees the invocation leave the client.
    appendChatMessage("user", userText || `Save summary to file`);
    if (summaryStatusEl) {
      summaryStatusEl.textContent = "正在生成总结…";
      summaryStatusEl.classList.remove("error", "ok");
    }
    isRunning = true;
    setControlsEnabled(false);
    setConnStatus("running", "Summarizing...");
  };
}

reviseLatestBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (!text || isRunning || !currentSessionId) return;
  if (
    !wsSafeSend(
      JSON.stringify({ type: "revise_latest", payload: { text } })
    )
  ) return;
  inputEl.value = "";
  reviseMode = false;
  updateReviseModeUI();
  isRunning = true;
  setControlsEnabled(false);
  setConnStatus("running", "Revising...");
  toolStatusEl.textContent = `Revising latest turn on ${currentBranchId}...`;
};

// fork_session and delete_latest are now triggered from per-message buttons
// (doBranchFromMessage / doDeleteLatest), not the composer row.

function doDeleteLatest() {
  if (!wsSafeSend(JSON.stringify({ type: "delete_latest" }))) return;
  // delete_latest is a synchronous backend op, not a model run. It replies with
  // session_updated + session_transcript (no run_completed), so do NOT set isRunning.
  // Just briefly show status; the reply handlers restore the UI.
  setControlsEnabled(false);
  toolStatusEl.textContent = "Deleting latest turn...";
  setRunHint("");
}

// Edit latest: load the latest user message text into the composer so the user can
// revise it in place, then click "Send edited message" below the input row.
let reviseMode = false;
const sendEditedBtn = document.getElementById("send-edited");

function startEditLatest(text) {
  inputEl.value = text;
  inputEl.focus();
  reviseMode = true;
  updateReviseModeUI();
}

function updateReviseModeUI() {
  if (reviseMode) {
    // Send-edited takes the slot where Send/Stop normally live; hide them
    // and show the edited-send button. It is wired to #input-row (same flex
    // row as send/stop), so the layout is identical to the regular composer.
    sendBtn.style.display = "none";
    stopBtn.style.display = "none";
    sendEditedBtn.style.display = "inline-grid";
    inputEl.placeholder = "Editing your latest message. Send to update.";
  } else {
    sendEditedBtn.style.display = "none";
    // setControlsEnabled will re-show the right slot based on isRunning.
    inputEl.placeholder = "Ask Alt Theory...";
  }
}

sendEditedBtn.onclick = () => {
  if (!reviseMode) return;
  reviseLatestBtn.click();
};

// Branch from a specific user message (forkPointEntryId).
function doBranchFromMessage(entryId, purpose) {
  const payload = { purpose };
  if (entryId) payload.forkPointEntryId = entryId;
  if (!wsSafeSend(JSON.stringify({ type: "fork_session", payload }))) return;
  setControlsEnabled(false);
  toolStatusEl.textContent = `Creating ${purpose} branch...`;
}

// Low-noise composer hint. Shown after Stop/interrupted; cleared on any next send action.
function setRunHint(text) {
  if (!text) {
    runHintEl.classList.add("hidden");
    runHintEl.textContent = "";
    runHintEl.title = "";
    return;
  }
  runHintEl.textContent = text;
  runHintEl.title = text;
  runHintEl.classList.remove("hidden");
}

// Unified composer notification: mono small text at #tool-status, with an
// optional single-glyph emoji prefix (e.g. "⚠", "⏏"). Auto-dismisses after
// a few seconds so transient notices do not pile up. Replaces the previous
// transcript `message.error` red rectangle and the private-intro system
// message at the center of the chat.
let toolStatusTimer = null;
const TOOL_STATUS_TTL_MS = 4500;
function setComposerNotice(prefix, text) {
  const body = String(text || "").trim();
  if (!body) {
    toolStatusEl.textContent = "";
    toolStatusEl.title = "";
    toolStatusEl.classList.remove("notice-warn");
    if (toolStatusTimer) {
      clearTimeout(toolStatusTimer);
      toolStatusTimer = null;
    }
    return;
  }
  const lead = prefix ? prefix + " " : "";
  toolStatusEl.textContent = lead + body;
  toolStatusEl.title = body;
  toolStatusEl.classList.toggle("notice-warn", prefix === "⚠");
  if (toolStatusTimer) clearTimeout(toolStatusTimer);
  toolStatusTimer = setTimeout(() => {
    toolStatusEl.textContent = "";
    toolStatusEl.title = "";
    toolStatusEl.classList.remove("notice-warn");
    toolStatusTimer = null;
  }, TOOL_STATUS_TTL_MS);
}

// New session — confirm if chat has messages
newSessionBtn.onclick = () => {
  if (isRunning) return;
  if (hasMessages) {
    showConfirm(
      "Start a new session? Current chat will be cleared.",
      doNewSession,
      "New Session"
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
}

sessionRefreshBtn.onclick = () => {
  fetchSessions();
};

sessionSearchEl.addEventListener("input", renderSessionList);

deleteSessionBtn.onclick = () => {
  const sessionId = selectedSessionDetail?.session?.sessionId;
  if (!sessionId) return;
  showConfirm(
    "Delete the selected session from the normal list?",
    () => {
      softDeleteSelectedSession(sessionId);
    },
    "Delete"
  );
};

async function softDeleteSelectedSession(sessionId) {
  deleteSessionBtn.disabled = true;
  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    selectedHistoricalSessionId = "";
    selectedSessionDetail = null;
    if (currentSessionId === sessionId) {
      doNewSession();
    } else {
      await fetchSessions();
    }
  } catch (error) {
    toolStatusEl.textContent = `Delete failed: ${error.message || error}`;
    renderSessionDetail();
  }
}

resumeSessionBtn.onclick = () => {
  const sessionId = selectedSessionDetail?.session?.sessionId;
  if (!sessionId || isRunning) return;
  if (hasMessages) {
    showConfirm(
      "Resume selected session? Current chat view will be cleared.",
      () => doOpenSession(sessionId),
      "Resume"
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
  toolStatusEl.textContent = "Opening selected session…";
}

// Refresh metadata/metrics
refreshMetricsBtn.onclick = () => {
  wsSafeSend(JSON.stringify({ type: "get_session_metadata" }));
  wsSafeSend(JSON.stringify({ type: "get_session_metrics" }));
};

recordsRefreshBtn.onclick = () => {
  fetchSessionRecords();
};

provenanceRefreshBtn.onclick = () => {
  if (currentSessionId) fetchSessionDetail(currentSessionId);
};

recordSaveBtn.onclick = () => {
  saveSessionRecord();
};

for (const button of viewToggleBtns) {
  button.onclick = () => {
    transcriptView = button.dataset.view || "developer";
    for (const item of viewToggleBtns) {
      item.classList.toggle("selected", item === button);
    }
    if (transcriptMessages.length) {
      renderTranscriptMessages();
    }
  };
}

for (const button of rightTabBtns) {
  button.onclick = () => {
    const tab = button.dataset.rightTab || "records";
    for (const item of rightTabBtns) {
      item.classList.toggle("selected", item === button);
    }
    for (const panel of rightTabPanels) {
      panel.classList.toggle("active", panel.dataset.rightPanel === tab);
    }
    if (tab === "records") {
      fetchSessionRecords();
    }
    if (tab === "provenance" && currentSessionId) {
      fetchSessionDetail(currentSessionId);
    }
  };
}

function applyPaneState() {
  document.documentElement.style.setProperty(
    "--left-width",
    `${paneState.leftWidth}px`
  );
  document.documentElement.style.setProperty(
    "--right-width",
    `${paneState.rightWidth}px`
  );
  leftPanel.classList.toggle("collapsed", paneState.leftCollapsed);
  rightPanel.classList.toggle("collapsed", paneState.rightCollapsed);
  leftResizer.classList.toggle("hidden", paneState.leftCollapsed);
  rightResizer.classList.toggle("hidden", paneState.rightCollapsed);
  restoreLeftBtn.classList.toggle("visible", paneState.leftCollapsed);
  restoreRightBtn.classList.toggle("visible", paneState.rightCollapsed);
}

function persistPaneState() {
  localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(paneState));
}

function loadPaneState() {
  try {
    Object.assign(paneState, JSON.parse(localStorage.getItem(PANE_STORAGE_KEY) || "{}"));
  } catch {}
  applyPaneState();
}

function beginResize(which, startX) {
  const startLeft = paneState.leftWidth;
  const startRight = paneState.rightWidth;
  const target = which === "left" ? leftResizer : rightResizer;
  target.classList.add("dragging");
  const onMove = (event) => {
    if (window.innerWidth <= 1024) return;
    if (which === "left") {
      paneState.leftWidth = Math.max(220, Math.min(420, startLeft + (event.clientX - startX)));
    } else {
      paneState.rightWidth = Math.max(260, Math.min(460, startRight - (event.clientX - startX)));
    }
    applyPaneState();
  };
  const onUp = () => {
    target.classList.remove("dragging");
    persistPaneState();
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function showConfirm(message, action, confirmText) {
  confirmMessage.textContent = message;
  if (confirmText) confirmYes.textContent = confirmText;
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

leftResizer.addEventListener("mousedown", (event) => beginResize("left", event.clientX));
rightResizer.addEventListener("mousedown", (event) => beginResize("right", event.clientX));
collapseLeftBtn.onclick = () => {
  paneState.leftCollapsed = true;
  applyPaneState();
  persistPaneState();
};
collapseRightBtn.onclick = () => {
  paneState.rightCollapsed = true;
  applyPaneState();
  persistPaneState();
};
restoreLeftBtn.onclick = () => {
  paneState.leftCollapsed = false;
  applyPaneState();
  persistPaneState();
};
restoreRightBtn.onclick = () => {
  paneState.rightCollapsed = false;
  applyPaneState();
  persistPaneState();
};
loadPaneState();

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
