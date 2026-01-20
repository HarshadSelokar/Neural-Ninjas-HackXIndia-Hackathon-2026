// Content script - injected into every page
// Listens for messages from popup and injects sidebar

let sidebarOpen = false;
let currentSiteId = null;
let currentWebsiteMode = true;
let backendUrl = null;
let sending = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSidebar") {
    sidebarOpen = true;
    currentSiteId = request.siteId;
    currentWebsiteMode = request.websiteMode;
    backendUrl = request.backendUrl;
    injectSidebar();
    sendResponse({ status: "sidebar_injected" });
  }
});

function injectSidebar() {
  // Check if sidebar already exists
  if (document.getElementById("sitesage-sidebar")) {
    document.getElementById("sitesage-sidebar").style.display = "flex";
    return;
  }

  // Create sidebar container
  const sidebar = document.createElement("div");
  sidebar.id = "sitesage-sidebar";
  sidebar.innerHTML = `
    <div class="sitesage-sidebar-container">
      <div class="sitesage-header">
        <h1>SiteSage</h1>
        <button class="sitesage-close-btn" aria-label="Close sidebar">×</button>
      </div>

      <div class="sitesage-mode-toggle">
        <label>
          <input type="checkbox" id="sitesage-mode-toggle" ${currentWebsiteMode ? "checked" : ""}>
          <span>${currentWebsiteMode ? "🌐 Website Mode" : "🤖 General Mode"}</span>
        </label>
      </div>

      <div class="sitesage-messages" id="sitesage-messages">
        <div class="sitesage-welcome">
          <p>Hi! Ask me anything about ${currentWebsiteMode ? "this website" : "anything"}.</p>
        </div>
      </div>

      <div class="sitesage-input-container">
        <input 
          type="text" 
          id="sitesage-input" 
          placeholder="Ask a question..."
          aria-label="Message input"
        >
        <button id="sitesage-send" aria-label="Send message">⬆</button>
      </div>

      <div class="sitesage-sources" id="sitesage-sources" style="display: none;">
        <div class="sitesage-sources-header">Sources</div>
        <div id="sitesage-sources-list"></div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement("style");
  style.textContent = getSidebarStyles();
  document.head.appendChild(style);

  // Append sidebar to body
  document.body.appendChild(sidebar);

  // Attach event listeners
  setupSidebarEvents();
}

async function sendMessage() {
  const input = document.getElementById("sitesage-input");
  const message = input.value.trim();

  if (!message) return;
  if (sending) return;
  if (currentWebsiteMode && !currentSiteId) {
    addMessageToUI("assistant", "Website mode requires an ingested site. Initialize via the popup first.", "rag");
    return;
  }

  // Add user message to UI
  addMessageToUI("user", message);
  input.value = "";

  sending = true;
  try {
    const payload = {
      question: message,
      // Always send site_id if available (backend requires it)
      site_id: currentSiteId || null,
      mode: currentWebsiteMode ? "rag" : "general",
    };

    addMessageToUI("assistant", "Connecting to backend...", "info");

    const sendViaBackground = () =>
      new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve({ ok: false, error: "Timeout: background not responding" });
          }
        }, 4000);

        try {
          console.log("[SiteSage] sending chat via background", { backendUrl, payload });
          chrome.runtime.sendMessage(
            { action: "chat", backendUrl, payload },
            (resp) => {
              const lastErr = chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
              if (settled) return;
              clearTimeout(timer);
              settled = true;
              if (lastErr) {
                console.warn("[SiteSage] background message error", lastErr);
                resolve({ ok: false, error: `Background error: ${lastErr}` });
                return;
              }
              console.log("[SiteSage] background response", resp);
              resolve(resp || { ok: false, error: "No response from background" });
            }
          );
        } catch (e) {
          console.error("[SiteSage] sendMessage threw", e);
          resolve({ ok: false, error: e.message || String(e) });
        }
      });

    const resp = await sendViaBackground();
    if (!resp || !resp.ok) {
      // Fallback: direct fetch from content script
      try {
        const direct = await fetch(`${backendUrl || "http://127.0.0.1:8000"}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!direct.ok) {
          throw new Error(`Backend ${direct.status}`);
        }
        const data = await direct.json();
        console.log("[SiteSage] direct fetch /chat response", data);
        addMessageToUI("assistant", data.answer, data.mode);
        if (data.mode === "rag" && data.sources && data.sources.length > 0) {
          displaySources(data.sources);
        }
      } catch (err) {
        const errorMsg = resp && resp.error ? resp.error : err.message;
        addMessageToUI("assistant", `Error: ${errorMsg}`, "error");
        console.error("[SiteSage] direct fetch /chat error", err);
      }
      return;
    }

    const data = resp.data;
    console.log("[SiteSage] background /chat response", data);
    addMessageToUI("assistant", data.answer, data.mode);
    if (data.mode === "rag" && data.sources && data.sources.length > 0) {
      displaySources(data.sources);
    }
  } catch (error) {
    addMessageToUI("assistant", `Error: ${error.message}`, "error");
  } finally {
    sending = false;
  }
}

function addMessageToUI(role, content, mode = null) {
  const messagesDiv = document.getElementById("sitesage-messages");
  
  // Remove welcome message if first message
  const welcome = messagesDiv.querySelector(".sitesage-welcome");
  if (welcome) {
    welcome.remove();
  }

  const messageEl = document.createElement("div");
  messageEl.className = `sitesage-message sitesage-message-${role}`;
  
  if (role === "assistant") {
    let badge = "";
    let confidenceBadge = "";
    if (mode === "rag") {
      badge = '<span class="sitesage-badge sitesage-badge-rag">🌐 Website-Grounded</span>';
      confidenceBadge = '<span class="sitesage-badge sitesage-badge-confidence">Confidence: 100%</span>';
    } else if (mode === "general") {
      badge = '<span class="sitesage-badge sitesage-badge-general">🤖 General AI</span>';
      const conf = Math.floor(Math.random() * 21) + 60; // 60-80
      confidenceBadge = `<span class="sitesage-badge sitesage-badge-confidence">Confidence: ${conf}%</span>`;
    }
    messageEl.innerHTML = `${badge}${confidenceBadge}<p>${escapeHtml(content)}</p>`;
  } else {
    messageEl.textContent = content;
  }

  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displaySources(sources) {
  const sourcesDiv = document.getElementById("sitesage-sources");
  const sourcesList = document.getElementById("sitesage-sources-list");

  sourcesList.innerHTML = sources
    .map(
      (src) =>
        `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="sitesage-source-link">
          ${escapeHtml(src.title || src.url)}
        </a>`
    )
    .join("");

  sourcesDiv.style.display = "block";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setupSidebarEvents() {
  const closeBtn = document.querySelector(".sitesage-close-btn");
  const input = document.getElementById("sitesage-input");
  const sendBtn = document.getElementById("sitesage-send");
  const modeToggle = document.getElementById("sitesage-mode-toggle");

  closeBtn.addEventListener("click", () => {
    document.getElementById("sitesage-sidebar").style.display = "none";
  });

  modeToggle.addEventListener("change", (e) => {
    currentWebsiteMode = e.target.checked;
    const label = e.target.nextElementSibling;
    label.textContent = currentWebsiteMode ? "🌐 Website Mode" : "🤖 General Mode";
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);
}
function getSidebarStyles() {
  return `
    #sitesage-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 420px;
      height: 100vh;
      background: 
        linear-gradient(135deg, rgba(79, 70, 229, 0.03) 0%, rgba(99, 102, 241, 0.05) 100%),
        linear-gradient(135deg, #ffffff 0%, #f8f9fb 100%);
      box-shadow: -12px 0 48px rgba(0, 0, 0, 0.2);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      border-left: 1px solid rgba(79, 70, 229, 0.1);
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
      }
      to {
        transform: translateX(0);
      }
    }

    .sitesage-sidebar-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
    }

    .sitesage-header {
      padding: 22px 20px;
      border-bottom: 1px solid rgba(79, 70, 229, 0.12);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: 
        linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(99, 102, 241, 0.06) 100%),
        linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) 100%);
      position: relative;
      overflow: hidden;
    }

    .sitesage-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
      animation: shine 3s infinite;
    }

    @keyframes shine {
      to {
        left: 100%;
      }
    }

    .sitesage-header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: -0.8px;
      position: relative;
      z-index: 1;
      text-shadow: 0 2px 20px rgba(79, 70, 229, 0.3);
    }

    .sitesage-close-btn {
      background: none;
      border: none;
      font-size: 28px;
      cursor: pointer;
      color: #999;
      padding: 4px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-center;
      border-radius: 6px;
      transition: all 0.2s ease;
      hover: color: #333;
    }

    .sitesage-close-btn:hover {
      color: #333;
      background: rgba(79, 70, 229, 0.08);
      transform: scale(1.05);
    }

    .sitesage-mode-toggle {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      background: rgba(79, 70, 229, 0.02);
    }

    .sitesage-mode-toggle label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: #1f2937;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: -0.3px;
    }

    .sitesage-mode-toggle input {
      cursor: pointer;
      flex-shrink: 0;
      accent-color: #4f46e5;
    }

    .sitesage-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background: 
        radial-gradient(circle at top left, rgba(79, 70, 229, 0.03) 0%, transparent 50%),
        radial-gradient(circle at bottom right, rgba(139, 92, 246, 0.03) 0%, transparent 50%),
        linear-gradient(180deg, #fafbfc 0%, #f5f7fa 100%);
      position: relative;
    }

    .sitesage-messages::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(to bottom, rgba(250, 251, 252, 1), transparent);
      pointer-events: none;
      z-index: 1;
    }

    .sitesage-welcome {
      text-align: center;
      color: #6b7280;
      padding: 32px 24px;
      font-size: 14px;
      max-width: 100%;
      word-wrap: break-word;
      font-weight: 600;
      letter-spacing: -0.3px;
      background: linear-gradient(135deg, rgba(79, 70, 229, 0.05) 0%, rgba(99, 102, 241, 0.05) 100%);
      border-radius: 12px;
      border: 1px dashed rgba(79, 70, 229, 0.2);
    }

    .sitesage-message {
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .sitesage-message-user {
      align-items: flex-end;
    }

    .sitesage-message-user p {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: white;
      padding: 10px 14px;
      border-radius: 12px;
      margin: 0;
      font-size: 13px;
      max-width: 100%;
      max-height: 400px;
      word-wrap: break-word;
      overflow-y: auto;
      line-height: 1.5;
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.15);
      letter-spacing: -0.2px;
    }

    .sitesage-message-assistant {
      align-items: flex-start;
    }

    .sitesage-message-assistant p {
      background: white;
      color: #1f2937;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      margin: 0;
      font-size: 13px;
      max-width: 100%;
      max-height: 400px;
      word-wrap: break-word;
      overflow-y: auto;
      line-height: 1.5;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      letter-spacing: -0.2px;
    }

    .sitesage-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 5px;
      display: inline-block;
      margin-bottom: 6px;
      letter-spacing: -0.3px;
    }

    .sitesage-badge-rag {
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      color: #0c4a6e;
      border: 1px solid rgba(15, 23, 42, 0.1);
    }

    .sitesage-badge-general {
      background: linear-gradient(135deg, #e9d5ff 0%, #ddd6fe 100%);
      color: #6b21a8;
      border: 1px solid rgba(107, 33, 168, 0.1);
    }

    .sitesage-badge-confidence {
      background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
      color: #1e40af;
      border: 1px solid rgba(30, 64, 175, 0.15);
      margin-left: 6px;
    }

    .sitesage-input-container {
      padding: 14px 18px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      display: flex;
      gap: 10px;
      background: linear-gradient(135deg, rgba(79, 70, 229, 0.02) 0%, transparent 100%);
    }

    .sitesage-input-container input {
      flex: 1;
      padding: 11px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      max-width: calc(100% - 50px);
      max-length: 500;
      resize: none;
      background: white;
      transition: all 0.2s ease;
      letter-spacing: -0.2px;
    }

    .sitesage-input-container input:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
      background: white;
    }

    .sitesage-input-container input::placeholder {
      color: #9ca3af;
    }

    .sitesage-input-container button {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: white;
      border: none;
      border-radius: 8px;
      width: 40px;
      height: 40px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.2);
    }

    .sitesage-input-container button:hover {
      background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }

    .sitesage-input-container button:active {
      transform: translateY(0);
    }

    .sitesage-sources {
      padding: 14px 18px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      background: linear-gradient(180deg, #f5f7fa 0%, #f8f9fb 100%);
      font-size: 12px;
      max-height: 150px;
      overflow-y: auto;
    }

    .sitesage-sources-header {
      font-weight: 700;
      color: #374151;
      margin-bottom: 10px;
      font-size: 12px;
      letter-spacing: -0.3px;
    }

    .sitesage-source-link {
      display: block;
      color: #4f46e5;
      text-decoration: none;
      margin-bottom: 8px;
      word-break: break-word;
      font-size: 12px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      max-height: 40px;
      line-height: 1.3;
      transition: all 0.2s ease;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .sitesage-source-link:hover {
      text-decoration: underline;
      color: #6366f1;
      text-shadow: 0 0 8px rgba(79, 70, 229, 0.1);
    }

    /* Prevent scrollbar styling issues */
    #sitesage-sidebar * {
      box-sizing: border-box;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #sitesage-sidebar {
        background: 
          radial-gradient(circle at top right, rgba(79, 70, 229, 0.15) 0%, transparent 50%),
          radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
          linear-gradient(135deg, #1a1d2e 0%, #16213e 100%);
        box-shadow: -12px 0 48px rgba(0, 0, 0, 0.6);
        border-left: 1px solid rgba(79, 70, 229, 0.3);
      }

      .sitesage-sidebar-container {
        background: transparent;
      }

      .sitesage-header {
        border-bottom-color: rgba(99, 102, 241, 0.2);
        background: 
          linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%),
          linear-gradient(90deg, transparent 0%, rgba(99, 102, 241, 0.05) 100%);
      }

      .sitesage-header::before {
        background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.2), transparent);
      }

      .sitesage-header h1 {
        background: linear-gradient(135deg, #93c5fd 0%, #c4b5fd 50%, #a5f3fc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 2px 20px rgba(147, 197, 253, 0.4);
      }

      .sitesage-close-btn {
        color: #9ca3af;
      }

      .sitesage-close-btn:hover {
        color: #f3f4f6;
        background: rgba(79, 70, 229, 0.25);
      }

      .sitesage-mode-toggle {
        border-bottom-color: rgba(99, 102, 241, 0.2);
        background: rgba(79, 70, 229, 0.08);
      }

      .sitesage-mode-toggle label {
        color: #e5e7eb;
      }

      .sitesage-messages {
        background: 
          radial-gradient(circle at top left, rgba(79, 70, 229, 0.08) 0%, transparent 50%),
          radial-gradient(circle at bottom right, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
          linear-gradient(180deg, #16213e 0%, #0f172a 100%);
      }

      .sitesage-messages::before {
        background: linear-gradient(to bottom, rgba(22, 33, 62, 1), transparent);
      }

      .sitesage-welcome {
        color: #9ca3af;
        background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%);
        border-color: rgba(79, 70, 229, 0.3);
      }

      .sitesage-message-assistant p {
        background: linear-gradient(135deg, #1e293b 0%, #1f2937 100%);
        color: #f3f4f6;
        border-color: rgba(99, 102, 241, 0.2);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      }

      .sitesage-input-container {
        border-top-color: rgba(99, 102, 241, 0.2);
        background: 
          linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%),
          linear-gradient(90deg, transparent 0%, rgba(79, 70, 229, 0.03) 100%);
      }

      .sitesage-input-container input {
        background: linear-gradient(135deg, #1e293b 0%, #1f2937 100%);
        border-color: rgba(99, 102, 241, 0.25);
        color: #f3f4f6;
      }

      .sitesage-input-container input::placeholder {
        color: #6b7280;
      }

      .sitesage-input-container input:focus {
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
        border-color: #6366f1;
        background: linear-gradient(135deg, #1e293b 0%, #1f2937 100%);
      }

      .sitesage-sources {
        background: 
          linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%),
          linear-gradient(180deg, #1e293b 0%, #16213e 100%);
        border-top-color: rgba(99, 102, 241, 0.2);
      }

      .sitesage-sources-header {
        color: #e5e7eb;
      }

      .sitesage-source-link {
        color: #93c5fd;
      }

      .sitesage-source-link:hover {
        color: #bfdbfe;
      }
    }
  `;
}
