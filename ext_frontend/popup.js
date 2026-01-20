// Popup script - handles UI for extension popup
const BACKEND_URL = "http://127.0.0.1:8000";

// Simple HTML escaper for safe rendering in popup
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

async function initPopup() {
  const contentEl = document.getElementById("content");
  const messageEl = document.getElementById("messageContainer");

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check if page is valid (not chrome://, file://, etc)
  const isInvalidPage = isPageInvalid(tab.url);
  
  if (isInvalidPage) {
    messageEl.innerHTML = `<div class="message error">Cannot load chatbot on this page</div>`;
    contentEl.innerHTML = `<div class="disabled-text">SiteSage works on regular websites. This page cannot be analyzed.</div>`;
    return;
  }

  // Check if current page is a YouTube video
  const isYouTube = tab.url.includes("youtube.com/watch") || tab.url.includes("youtu.be/");
  
  if (isYouTube) {
    renderYouTubeIngestUI(contentEl, messageEl, tab.url);
    return;
  }

  // Check if current page looks like a PDF
  const isPDF = tab.url.toLowerCase().includes('.pdf');
  if (isPDF) {
    renderPDFIngestUI(contentEl, messageEl, tab.url);
    return;
  }

  // Extract domain for site_id
  const siteId = extractDomain(tab.url);
  
  // Check if site is already ingested (cached)
  chrome.storage.local.get(`site_${siteId}`, (result) => {
    const cached = result[`site_${siteId}`];
    
    if (cached) {
      renderChatUI(contentEl, messageEl, siteId, cached, tab.url);
    } else {
      renderIngestUI(contentEl, messageEl, siteId, tab.url);
    }
  });
}

function isPageInvalid(url) {
  const invalidProtocols = ["chrome://", "file://", "about://", "data://", "edge://"];
  return invalidProtocols.some(proto => url.startsWith(proto));
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function renderIngestUI(contentEl, messageEl, siteId, url) {
  contentEl.innerHTML = `
    <div class="status-section">
      <div class="status-label">Current Website</div>
      <div class="status-value">${siteId}</div>
    </div>
    <button class="btn-primary" id="ingestBtn">Initialize Chatbot for This Site</button>
  `;

  document.getElementById("ingestBtn").addEventListener("click", () => {
    ingestSite(siteId, url, contentEl, messageEl);
  });
}

function renderChatUI(contentEl, messageEl, siteId, cached, url) {
  const tpl = document.getElementById("chatTemplate");
  contentEl.innerHTML = "";
  contentEl.appendChild(tpl.content.cloneNode(true));

  const status = document.getElementById("chatStatus");
  status.innerHTML = `
    <div class="status-label">✓ Ready to Chat</div>
    <div class="status-value">${siteId}</div>
    <div style="font-size: 11px; color: #666; margin-top: 4px;">${(cached.chunksIndexed || cached.chunks_indexed || 0)} chunks indexed</div>
  `;

  const modeToggle = document.getElementById("modeToggle");
  const modeLabel = document.getElementById("modeLabel");
  const messagesEl = document.getElementById("messages");
  const snapshotsPanel = document.getElementById("snapshotsPanel");
  const snapshotsList = document.getElementById("snapshotsList");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const sourcesEl = document.getElementById("sources");
  const sourcesListEl = document.getElementById("sourcesList");

  let ragMode = true;
  modeToggle.addEventListener("click", (e) => {
    ragMode = !ragMode;
    e.target.classList.toggle("active");
    modeLabel.textContent = ragMode ? "✓ Verified Answers" : "🧠 Explained Answers";
  });

  function addMessage(role, content, mode = null) {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "8px";
    const bubble = document.createElement("div");
    bubble.style.borderRadius = "8px";
    bubble.style.padding = "8px 12px";
    bubble.style.maxWidth = "85%";
    bubble.style.wordBreak = "break-word";
    if (role === "user") {
      bubble.style.background = "#4f46e5";
      bubble.style.color = "white";
      bubble.style.marginLeft = "auto";
    } else {
      bubble.style.background = "white";
      bubble.style.color = "#333";
      bubble.style.border = "1px solid #e5e7eb";
    }
    if (role === "assistant" && mode) {
      const badge = document.createElement("span");
      badge.style.fontSize = "11px";
      badge.style.fontWeight = "600";
      badge.style.padding = "2px 6px";
      badge.style.borderRadius = "4px";
      badge.style.display = "inline-block";
      badge.style.marginBottom = "4px";
      if (mode === "rag") {
        badge.textContent = "Source-only";
        badge.style.background = "#dbeafe";
        badge.style.color = "#0c4a6e";
      } else {
        badge.textContent = "Source + Reasoning";
        badge.style.background = "#e9d5ff";
        badge.style.color = "#6b21a8";
      }
      wrap.appendChild(badge);
    }
    bubble.innerHTML = `<p>${escapeHtml(content)}</p>`;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendChat() {
    const text = inputEl.value.trim();
    if (!text) return;
    if (!siteId) {
      messageEl.innerHTML = `<div class="message error">Please ingest content first.</div>`;
      return;
    }
    addMessage("user", text);
    inputEl.value = "";

    const payload = {
      question: text,
      site_id: siteId,
      mode: ragMode ? "rag" : "general",
    };

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "chat", backendUrl: BACKEND_URL, payload },
        (r) => resolve(r)
      );
    });

    if (!resp || !resp.ok) {
      const errMsg = (resp && resp.error) || "Failed to fetch";
      addMessage("assistant", `Sorry, I encountered an error: ${errMsg}`);
      return;
    }

    const data = resp.data;
    addMessage("assistant", data.answer || data.message, data.mode || (ragMode ? "rag" : "general"));

    if (data.sources && data.sources.length > 0) {
      sourcesListEl.innerHTML = data.sources
        .map((src) => {
          // Handle both string sources (old format) and object sources (new format)
          const url = typeof src === "string" ? src : src.url;
          const displayText = src.title || url;
          
          return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:block; font-size:12px; color:#4f46e5; text-decoration:none; margin-bottom:6px;">${escapeHtml(displayText)}</a>`;
        })
        .join("");
      sourcesEl.style.display = "block";
    } else {
      sourcesEl.style.display = "none";
      sourcesListEl.innerHTML = "";
    }

  }

  sendBtn.addEventListener("click", sendChat);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  // Add re-ingest button below status
  const re = document.createElement("button");
  re.className = "btn-secondary";
  re.textContent = "Re-ingest";
  re.style.marginTop = "8px";
  status.appendChild(re);
  re.addEventListener("click", () => {
    chrome.storage.local.remove(`site_${siteId}`);
    renderIngestUI(contentEl, messageEl, siteId, url);
  });

  // Add Export PDF (Finish) button
  // Show Export and Snapshot controls only for YouTube videos
  const isYouTubePage = url && (url.includes("youtube.com/watch") || url.includes("youtu.be/"));
  if (isYouTubePage) {
    const exp = document.createElement("button");
    exp.className = "btn-primary";
    exp.textContent = "Finish & Export PDF";
    exp.style.marginTop = "8px";
    exp.style.marginLeft = "8px";
    status.appendChild(exp);
    exp.addEventListener("click", async () => {
      exp.disabled = true;
      exp.textContent = "Generating PDF...";
      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'EXPORT_PDF', payload: { videoUrl: url, backendUrl: BACKEND_URL } }, (r) => resolve(r));
        });
        if (!resp || !resp.ok) throw new Error(resp && resp.error ? resp.error : 'Export failed');
        alert('PDF export started. Check your downloads.');
      } catch (err) {
        alert('Export failed: ' + (err.message || err));
      } finally {
        exp.disabled = false;
        exp.textContent = "Finish & Export PDF";
      }
    });

    // Snapshot viewer toggle
    const snapToggle = document.createElement('button');
    snapToggle.className = 'btn-secondary';
    snapToggle.textContent = 'View Snapshots';
    snapToggle.style.marginTop = '8px';
    snapToggle.style.marginLeft = '8px';
    status.appendChild(snapToggle);
    // Create snapshots panel if not present
    if (!document.getElementById('snapshotsPanel')) {
      const panel = document.createElement('div');
      panel.id = 'snapshotsPanel';
      panel.style.marginTop = '10px';
      panel.style.maxHeight = '320px';
      panel.style.overflowY = 'auto';
      panel.style.padding = '8px';
      panel.style.border = '1px solid #e5e7eb';
      panel.style.borderRadius = '8px';
      panel.style.background = '#fff';
      panel.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="font-weight:700;">Snapshots</div>
          <div>
            <button id="exportSelectedBtn" class="btn-primary" style="font-size:12px; padding:6px 8px; margin-left:8px;">Export Selected</button>
          </div>
        </div>
        <div id="snapshotsList">Loading...</div>`;
      status.appendChild(panel);

      // Wire export selected button
      panel.querySelector('#exportSelectedBtn').addEventListener('click', async () => {
        const listContainer = document.getElementById('snapshotsList');
        if (!listContainer) return;
        const checks = listContainer.querySelectorAll('input[type="checkbox"][data-snap-id]');
        const selected = [];
        checks.forEach(ch => { if (ch.checked) selected.push(ch.dataset.snapId); });

        // If none selected, confirm to export all
        const videoId = (url||'').match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1] || (url||'').replace(/[^a-z0-9]/gi,'_').slice(0,32);
        const key = `snapshots_${videoId}`;

        chrome.storage.local.get([key], async (res) => {
          const all = res[key] || [];
          let toExport = [];
          if (selected.length === 0) {
            // export all
            toExport = all;
          } else {
            const idSet = new Set(selected);
            toExport = all.filter(s => idSet.has(s.id));
          }

          if (!toExport.length) {
            alert('No snapshots selected to export.');
            return;
          }

          // Send selected snapshots directly to background export flow
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'EXPORT_PDF', payload: { snapshots: toExport, videoUrl: url, backendUrl: BACKEND_URL } }, (r) => resolve(r));
          });

          if (!resp || !resp.ok) {
            alert('Export failed: ' + (resp && resp.error));
          } else {
            alert('PDF export started. Check your downloads.');
          }
        });
      });
    }

    snapToggle.addEventListener('click', () => {
      const p = document.getElementById('snapshotsPanel');
      if (!p) return;
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
      if (p.style.display !== 'none') loadSnapshots(siteId || url);
    });
  }

  async function loadSnapshots(videoUrlOrSiteId) {
    // Attempt multiple keys so snapshots are found whether stored by videoId, by site_id (youtube-<id>), or by sanitized url
    const asUrl = videoUrlOrSiteId || '';
    const vidFromUrl = (asUrl||'').match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
    const sanitized = (asUrl||'').replace(/[^a-z0-9]/gi,'_').slice(0,32);

    const candidates = [];
    if (vidFromUrl) candidates.push(vidFromUrl);
    // if site_id was like 'youtube-<id>', extract the part after 'youtube-'
    const m = (asUrl||'').match(/^youtube-(.+)$/);
    if (m && m[1]) candidates.push(m[1]);
    // try the full sanitized string too
    candidates.push(sanitized);

    // Build storage keys
    const keys = candidates.map(c => `snapshots_${c}`);

    chrome.storage.local.get(keys, (res) => {
      let list = [];
      for (const k of keys) {
        if (res && Array.isArray(res[k]) && res[k].length) {
          list = res[k];
          break;
        }
      }
      const container = document.getElementById('snapshotsList');
      if (!container) return;
      if (!list.length) {
        container.innerHTML = '<div style="color:#666">No snapshots yet for this video/site.</div>';
        return;
      }
      container.innerHTML = '';
      list.slice().reverse().forEach(s => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.gap = '8px';
        item.style.marginBottom = '8px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.snapId = s.id;
        checkbox.style.marginTop = '6px';
        checkbox.style.marginRight = '11px';

        const img = document.createElement('img');
        img.src = s.imageDataUrl;
        img.style.width = '110px';
        img.style.height = '62px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';

        const meta = document.createElement('div');
        meta.style.flex = '1';

        const info = document.createElement('div');
        info.style.fontSize = '12px';
        info.style.color = '#333';
        info.style.marginBottom = '6px';
        info.innerHTML = `<strong>${s.title || ''}</strong> — <span style="color:#666">${s.timestamp || ''}</span>`;

        const captionInput = document.createElement('textarea');
        captionInput.value = s.caption || '';
        captionInput.style.width = '100%';
        captionInput.style.height = '56px';
        captionInput.style.fontSize = '13px';
        captionInput.style.marginBottom = '6px';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Caption';
        saveBtn.className = 'btn-primary';
        saveBtn.addEventListener('click', () => {
          const updated = Object.assign({}, s, { caption: captionInput.value });
          chrome.runtime.sendMessage({ action: 'SMART_SNAPSHOT_SAVE', payload: updated }, (r) => {
            if (r && r.ok) {
              alert('Caption saved');
              loadSnapshots(videoUrlOrSiteId);
            } else {
              alert('Save failed: ' + (r && r.error));
            }
          });
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '❌';
        delBtn.title = 'Delete snapshot';
        delBtn.style.marginLeft = '0px';
        delBtn.style.marginRight = '8px';
        delBtn.style.padding = '0px';
        delBtn.style.alignSelf = 'flex-start';
        delBtn.style.background = 'transparent';
        delBtn.style.border = 'none';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '16px';
        delBtn.addEventListener('click', () => {
          // compute storage key based on this snapshot's videoUrl
          const vid = (() => {
            try {
              const m = (s.videoUrl || '').match(/(?:v=|youtu\.be\/)([^&?#]+)/);
              return m ? m[1] : (s.videoUrl || '').replace(/[^a-z0-9]/gi,'_').slice(0,32);
            } catch (e) { return 'unknown'; }
          })();
          const key = `snapshots_${vid}`;
          chrome.storage.local.get([key], (res) => {
            const list = res[key] || [];
            const newList = list.filter(x => x.id !== s.id);
            const obj = {}; obj[key] = newList;
            chrome.storage.local.set(obj, () => {
              loadSnapshots(videoUrlOrSiteId);
            });
          });
        });

        meta.appendChild(info);
        meta.appendChild(captionInput);
        meta.appendChild(saveBtn);

        // Group checkbox and delete button in a single container
        const controlsContainer = document.createElement('div');
        controlsContainer.style.display = 'flex';
        controlsContainer.style.flexDirection = 'column';
        controlsContainer.style.gap = '0px';
        controlsContainer.style.alignItems = 'left';
        controlsContainer.appendChild(checkbox);
        controlsContainer.appendChild(delBtn);

        item.appendChild(controlsContainer);
        item.appendChild(img);
        item.appendChild(meta);
        container.appendChild(item);
      });
    });
  }

}

async function ingestSite(siteId, url, contentEl, messageEl) {
  const btn = document.getElementById("ingestBtn");
  btn.disabled = true;
  btn.textContent = "Initializing...";
  
  messageEl.innerHTML = `<div class="message info">Fetching and embedding website content...</div>`;

  try {
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "ingest", backendUrl: BACKEND_URL, url },
        (r) => resolve(r)
      );
    });

    if (!resp || !resp.ok) {
      throw new Error(resp && resp.error ? resp.error : "Backend error");
    }

    const data = resp.data;
    
    // Cache the ingestion result
    chrome.storage.local.set({
      [`site_${siteId}`]: {
        url,
        chunksIndexed: data.chunks_indexed || 0,
        pagesIndexed: data.pages_crawled || 0,
        cached: data.cached || false,
        timestamp: Date.now(),
      },
    });

    messageEl.innerHTML = `<div class="message success">✓ Ready! Start chatting below</div>`;
    renderChatUI(contentEl, messageEl, siteId, data, url);
  } catch (error) {
    messageEl.innerHTML = `<div class="message error">Error: ${error.message}</div>`;
    btn.disabled = false;
    btn.textContent = "Initialize Chatbot for This Site";
  }
}

  async function ingestYouTubeVideo(videoUrl, siteIdOverride, contentEl, messageEl) {
    const btn = document.getElementById("ingestYouTubeBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Indexing...";
    }

    messageEl.innerHTML = `<div class="message info">Fetching transcript and embedding...</div>`;

    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "ingestYoutube", backendUrl: BACKEND_URL, videoUrl, siteId: siteIdOverride },
          (r) => resolve(r)
        );
      });

      if (!resp || !resp.ok) {
        throw new Error(resp && resp.error ? resp.error : "Backend error");
      }

      const data = resp.data;
      const siteId = data.site_id || siteIdOverride || `youtube-${(data.video_id || "video")}`;

      chrome.storage.local.set({
        [`site_${siteId}`]: {
          url: videoUrl,
          chunksIndexed: data.chunks_indexed || 0,
          pagesIndexed: data.segments_processed || 0,
          cached: false,
          timestamp: Date.now(),
        },
      });

      messageEl.innerHTML = `<div class="message success">✓ Video indexed. Ready to chat.</div>`;
      renderChatUI(contentEl, messageEl, siteId, data, videoUrl);
    } catch (error) {
      console.error("YouTube ingest error", error);
      messageEl.innerHTML = `<div class="message error">Error: ${error.message}</div>`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Index This Video";
      }
    }

    async function ingestPdfUrl(pdfUrl, siteIdOverride, contentEl, messageEl) {
      const btn = document.getElementById("ingestPdfBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Indexing...";
      }

      messageEl.innerHTML = `<div class="message info">Fetching PDF and embedding...</div>`;

      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "ingestPdf", backendUrl: BACKEND_URL, pdfUrl, siteId: siteIdOverride },
            (r) => resolve(r)
          );
        });

        if (!resp || !resp.ok) {
          throw new Error(resp && resp.error ? resp.error : "Backend error");
        }

        const data = resp.data;
        const siteId = data.site_id || siteIdOverride || `pdf-${(data.source_url || "file")}`;

        chrome.storage.local.set({
          [`site_${siteId}`]: {
            url: pdfUrl,
            chunksIndexed: data.chunks_indexed || 0,
            pagesIndexed: data.pages_processed || 0,
            cached: false,
            timestamp: Date.now(),
          },
        });

        messageEl.innerHTML = `<div class="message success">✓ PDF indexed. Ready to chat.</div>`;
        renderChatUI(contentEl, messageEl, siteId, data, pdfUrl);
      } catch (error) {
        console.error("PDF ingest error", error);
        messageEl.innerHTML = `<div class="message error">Error: ${error.message}</div>`;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Index This PDF";
        }
      }
    }
  }

function renderYouTubeIngestUI(contentEl, messageEl, videoUrl) {
  const videoId = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || "unknown";
  
  contentEl.innerHTML = `
    <div class="status-section">
      <div class="status-label">🎥 YouTube Video Detected</div>
      <div class="status-value" style="font-size: 11px;">Video ID: ${escapeHtml(videoId)}</div>
    </div>
    <div style="font-size: 11px; color: #666; margin: 12px 0; line-height: 1.4;">
      Click "Index This Video" to start indexing this video automatically.
    </div>
    <button class="btn-primary" id="ingestYouTubeBtn" style="width: 100%;">Index This Video</button>
    <button class="btn-secondary" id="transcribeAudioBtn" style="width: 100%; margin-top: 8px;">Transcribe Audio (Fallback)</button>
  `;

  const ingestBtn = document.getElementById("ingestYouTubeBtn");

  ingestBtn.addEventListener("click", async () => {
    // Automatically use current tab URL without requiring manual input
    ingestYouTubeVideo(videoUrl, null, contentEl, messageEl);
  });

  document.getElementById("transcribeAudioBtn").addEventListener("click", async () => {
    const btn = document.getElementById("transcribeAudioBtn");
    btn.disabled = true;
    btn.textContent = "Starting transcription...";

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'transcribeYoutube', backendUrl: BACKEND_URL, videoUrl, siteId: null },
        (r) => resolve(r)
      );
    });

    if (!resp || !resp.ok) {
      alert('Transcription start failed: ' + (resp && resp.error));
      btn.disabled = false;
      btn.textContent = "Transcribe Audio (Fallback)";
      return;
    }

    // If backend started a job, it should return job_id
    const jobId = resp.job_id || (resp.data && resp.data.job_id) || resp.data?.job_id;
    if (!jobId) {
      // Sometimes backend returns accepted body directly
      if (resp.data && resp.data.status === 'accepted' && resp.data.job_id) {
        pollJobStatus(resp.data.job_id, btn);
        return;
      }
      alert('Transcription request did not return a job id.');
      btn.disabled = false;
      btn.textContent = "Transcribe Audio (Fallback)";
      return;
    }

    pollJobStatus(jobId, btn);
  });

  function pollJobStatus(jobId, btn) {
    const statusDivId = 'transcriptionStatus';
    let statusDiv = document.getElementById(statusDivId);
    if (!statusDiv) {
      statusDiv = document.createElement('div');
      statusDiv.id = statusDivId;
      statusDiv.style.marginTop = '8px';
      messageEl.appendChild(statusDiv);
    }

    const interval = setInterval(async () => {
      const st = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getJobStatus', backendUrl: BACKEND_URL, jobId }, (r) => resolve(r));
      });
      if (!st || !st.ok) {
        statusDiv.textContent = 'Error fetching job status';
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = "Transcribe Audio (Fallback)";
        return;
      }

      const job = st.data;
      statusDiv.textContent = `Status: ${job.status} — ${job.progress || 0}%`;

      if (job.status === 'completed') {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = "Transcribe Audio (Fallback)";
        alert('Transcription complete. Site id: ' + (job.result?.site_id || 'unknown'));
        const siteId = job.result?.site_id || `youtube-${videoId}`;
        chrome.storage.local.set({ [`site_${siteId}`]: { url: videoUrl, chunksIndexed: 0, pagesIndexed: 0, cached: false, timestamp: Date.now() } }, () => {
          renderChatUI(contentEl, messageEl, siteId, {}, videoUrl);
        });
      } else if (job.status === 'failed') {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = "Transcribe Audio (Fallback)";
        alert('Transcription failed: ' + (job.error || 'unknown'));
      }
    }, 2000);
  }
}

function renderPDFIngestUI(contentEl, messageEl, pdfUrl) {
  const pdfName = pdfUrl.split('/').pop() || "pdf";

  contentEl.innerHTML = `
    <div class="status-section">
      <div class="status-label">📄 PDF Detected</div>
      <div class="status-value" style="font-size: 11px;">${escapeHtml(pdfName)}</div>
    </div>
    <div style="font-size: 11px; color: #666; margin: 12px 0; line-height: 1.4;">
      You can index this PDF directly. Optionally provide a site_id to group with other sources.
    </div>
    <label style="display:block; font-size: 12px; margin-bottom:4px; color:#444;">Put the PDF URL</label>
    <input id="customPdfSiteId" placeholder="leave blank for auto (pdf-${escapeHtml(pdfName)})" style="width:100%; padding:8px; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:8px;" />
    <button class="btn-primary" id="ingestPdfBtn" style="width: 100%;">Index This PDF</button>
  `;

  const ingestBtn = document.getElementById("ingestPdfBtn");
  ingestBtn.addEventListener("click", async () => {
    const siteIdOverride = document.getElementById("customPdfSiteId").value.trim() || null;
    ingestPdfUrl(pdfUrl, siteIdOverride, contentEl, messageEl);
  });
}

// Sidebar removed; chatbot runs directly in popup

// Initialize when popup opens
document.addEventListener("DOMContentLoaded", initPopup);
