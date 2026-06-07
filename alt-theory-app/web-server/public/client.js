/**
 * Alt Theory — Frontend Client
 *
 * Vanilla JS WebSocket client. Connects to server, renders messages,
 * handles KB/Profile switching.
 */

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stop");
const toolStatusEl = document.getElementById("tool-status");
const sessionIdEl = document.getElementById("session-id");
const sessionStatusEl = document.getElementById("session-status");
const kbSelect = document.getElementById("kb-select");
const profileSelect = document.getElementById("profile-select");
const newSessionBtn = document.getElementById("new-session-btn");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentAssistantEl = null;
let isRunning = false;

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

const ws = new WebSocket(`ws://${location.host}`);

ws.onopen = () => {
  console.log("[ws] Connected");
  sessionStatusEl.textContent = "Connected";
};

ws.onclose = () => {
  console.log("[ws] Disconnected");
  sessionStatusEl.textContent = "Disconnected";
};

ws.onerror = (err) => {
  console.error("[ws] Error", err);
};

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    // --- Session lifecycle ---
    case "session_opened":
      sessionIdEl.textContent = `Session: ${msg.payload.sessionId.slice(0, 8)}…`;
      sessionStatusEl.textContent = "Ready";
      console.log("[ws] Session opened:", msg.payload.sessionId);
      break;

    case "session_updated":
      sessionStatusEl.textContent = msg.payload.status;
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
      const toolText = {
        read: "Reading knowledge base…",
        grep: "Searching for relevant theories…",
        find: "Locating files…",
        ls: "Listing resources…",
      }[msg.payload.toolName] || "Processing…";
      toolStatusEl.textContent = `⏳ ${toolText}`;
      toolStatusEl.dataset.currentTool = toolText;
      break;
    }

    case "tool_updated":
      // Could show progress bar or spinner update — kept minimal for MVP
      break;

    case "tool_finished":
      toolStatusEl.textContent = `✓ ${toolStatusEl.dataset.currentTool || "Done"}`;
      break;

    // --- Run completion ---
    case "run_completed": {
      currentAssistantEl = null;
      isRunning = false;
      sendBtn.style.display = "inline";
      stopBtn.style.display = "none";
      sessionStatusEl.textContent = "Ready";
      toolStatusEl.textContent = "";
      break;
    }

    case "run_failed": {
      const errEl = document.createElement("div");
      errEl.className = "message error";
      errEl.textContent = msg.payload.error;
      messagesEl.appendChild(errEl);
      currentAssistantEl = null;
      isRunning = false;
      sendBtn.style.display = "inline";
      stopBtn.style.display = "none";
      sessionStatusEl.textContent = "Error";
      break;
    }

    case "error": {
      const errEl = document.createElement("div");
      errEl.className = "message error";
      errEl.textContent = msg.payload.error;
      messagesEl.appendChild(errEl);
      break;
    }
  }

  // Auto-scroll
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isRunning) return;

  // Render user message
  const userEl = document.createElement("div");
  userEl.className = "message user";
  userEl.textContent = text;
  messagesEl.appendChild(userEl);

  // Send to server
  ws.send(JSON.stringify({ type: "prompt", payload: text }));
  inputEl.value = "";

  // Toggle buttons
  isRunning = true;
  sendBtn.style.display = "none";
  stopBtn.style.display = "inline";
  sessionStatusEl.textContent = "Thinking…";
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
  ws.send(JSON.stringify({ type: "abort" }));
  toolStatusEl.textContent = "Stopping…";
};

// KB switch
kbSelect.addEventListener("change", (e) => {
  ws.send(JSON.stringify({ type: "switch_kb", payload: { domain: e.target.value } }));
});

// Profile switch
profileSelect.addEventListener("change", (e) => {
  ws.send(JSON.stringify({ type: "switch_profile", payload: { profileSlug: e.target.value } }));
});

// New session
newSessionBtn.onclick = () => {
  // Clear messages
  messagesEl.innerHTML = "";
  currentAssistantEl = null;
  isRunning = false;
  sendBtn.style.display = "inline";
  stopBtn.style.display = "none";
  toolStatusEl.textContent = "";

  ws.send(JSON.stringify({ type: "new_session" }));
};
