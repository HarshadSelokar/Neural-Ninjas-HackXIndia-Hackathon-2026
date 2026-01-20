// Background service worker (Manifest V3)
// Used for handling long-running tasks and message passing

chrome.runtime.onInstalled.addListener(() => {
  console.log("SiteSage extension installed");
});

// Message bridge: proxy network calls to backend to avoid PNA/CORS issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request || {};

  if (action === "chat") {
    const { backendUrl, payload } = request;
    console.log("[SiteSage] chat request", { backendUrl, payload });

    const doFetch = (url) =>
      fetch(`${url}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

    doFetch(backendUrl)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend ${res.status}: ${text}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("[SiteSage] chat response", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.warn("[SiteSage] chat error", err);
        const fallbackUrl = backendUrl.includes("127.0.0.1")
          ? backendUrl.replace("127.0.0.1", "localhost")
          : backendUrl.includes("localhost")
          ? backendUrl.replace("localhost", "127.0.0.1")
          : null;
        if (fallbackUrl) {
          doFetch(fallbackUrl)
            .then(async (res) => {
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Backend ${res.status}: ${text}`);
              }
              return res.json();
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err2) => sendResponse({ ok: false, error: err2.message }));
          return true;
        }
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async response
  }

  if (action === "ingest") {
    const { backendUrl, url } = request;
    console.log("[SiteSage] ingest request", { backendUrl, url });

    const doFetch = (u) =>
      fetch(`${u}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      });

    doFetch(backendUrl)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend ${res.status}: ${text}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("[SiteSage] ingest response", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.warn("[SiteSage] ingest error", err);
        const fallbackUrl = backendUrl.includes("127.0.0.1")
          ? backendUrl.replace("127.0.0.1", "localhost")
          : backendUrl.includes("localhost")
          ? backendUrl.replace("localhost", "127.0.0.1")
          : null;
        if (fallbackUrl) {
          doFetch(fallbackUrl)
            .then(async (res) => {
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Backend ${res.status}: ${text}`);
              }
              return res.json();
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err2) => sendResponse({ ok: false, error: err2.message }));
          return true;
        }
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async response
  }

  if (action === "ingestYoutube") {
    const { backendUrl, videoUrl, siteId } = request;
    console.log("[SiteSage] ingest youtube request", { backendUrl, videoUrl, siteId });

    const doFetch = (u) =>
      fetch(`${u}/ingest/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: videoUrl, site_id: siteId || null }),
      });

    doFetch(backendUrl)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend ${res.status}: ${text}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("[SiteSage] ingest youtube response", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.warn("[SiteSage] ingest youtube error", err);
        const fallbackUrl = backendUrl.includes("127.0.0.1")
          ? backendUrl.replace("127.0.0.1", "localhost")
          : backendUrl.includes("localhost")
          ? backendUrl.replace("localhost", "127.0.0.1")
          : null;
        if (fallbackUrl) {
          doFetch(fallbackUrl)
            .then(async (res) => {
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Backend ${res.status}: ${text}`);
              }
              return res.json();
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err2) => sendResponse({ ok: false, error: err2.message }));
          return true;
        }
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async response
  }

  if (action === 'transcribeYoutube') {
    const { backendUrl, videoUrl, siteId } = request;
    console.log("[SiteSage] transcribe youtube request", { backendUrl, videoUrl, siteId });

    const doFetch = (u) =>
      fetch(`${u}/ingest/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: videoUrl, site_id: siteId || null }),
      });

    doFetch(backendUrl)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend ${res.status}: ${text}`);
        }
        return res.json();
      })
      .then((data) => {
        // expected: { status: 'accepted', job_id, message } or normal ingest success
        sendResponse({ ok: true, data, job_id: data.job_id || data.jobId || null });
      })
      .catch((err) => {
        console.warn("[SiteSage] transcribe youtube error", err);
        const fallbackUrl = backendUrl.includes("127.0.0.1")
          ? backendUrl.replace("127.0.0.1", "localhost")
          : backendUrl.includes("localhost")
          ? backendUrl.replace("localhost", "127.0.0.1")
          : null;
        if (fallbackUrl) {
          doFetch(fallbackUrl)
            .then(async (res) => {
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Backend ${res.status}: ${text}`);
              }
              return res.json();
            })
            .then((data) => sendResponse({ ok: true, data, job_id: data.job_id || data.jobId || null }))
            .catch((err2) => sendResponse({ ok: false, error: err2.message }));
          return true;
        }
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async
  }

  if (action === 'getJobStatus') {
    const { backendUrl, jobId } = request;
    const url = `${backendUrl.replace(/\/$/, '')}/transcription/job/${encodeURIComponent(jobId)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Backend ${res.status}: ${t}`);
        }
        return res.json();
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => {
        const fallbackUrl = backendUrl.includes("127.0.0.1")
          ? backendUrl.replace("127.0.0.1", "localhost")
          : backendUrl.includes("localhost")
          ? backendUrl.replace("localhost", "127.0.0.1")
          : null;
        if (fallbackUrl) {
          fetch(`${fallbackUrl.replace(/\/$/, '')}/transcription/job/${encodeURIComponent(jobId)}`)
            .then(async (res) => {
              if (!res.ok) {
                const t = await res.text();
                throw new Error(`Backend ${res.status}: ${t}`);
              }
              return res.json();
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err2) => sendResponse({ ok: false, error: err2.message }));
          return true;
        }
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (action === "ingestPdf") {
    const { backendUrl, pdfUrl, siteId } = request;
    console.log("[SiteSage] ingest pdf request", { backendUrl, pdfUrl, siteId });

    const doFetch = (u) =>
      fetch(`${u}/ingest/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pdfUrl, site_id: siteId || null }),
      });

    doFetch(backendUrl)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend ${res.status}: ${text}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("[SiteSage] ingest pdf response", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.warn("[SiteSage] ingest pdf error", err);
        const fallbackUrl = backendUrl.includes("127.0.0.1")
          ? backendUrl.replace("127.0.0.1", "localhost")
          : backendUrl.includes("localhost")
          ? backendUrl.replace("localhost", "127.0.0.1")
          : null;
        if (fallbackUrl) {
          doFetch(fallbackUrl)
            .then(async (res) => {
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Backend ${res.status}: ${text}`);
              }
              return res.json();
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err2) => sendResponse({ ok: false, error: err2.message }));
          return true;
        }
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async response
  }

  // PDF ingestion removed
});

// Handle smart snapshot capture: generate caption (via backend) and persist to storage
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, payload } = request || {};
  if (action === 'SMART_SNAPSHOT_CAPTURE') {
    // payload: { video_url, title, timestamp_seconds, timestamp, image_data_url }
    (async () => {
      try {
        // Generate caption via backend snapshot endpoint if backendUrl known
        // Try to infer backendUrl from sender tab (if present) or default localhost
        const backendUrl = payload.backendUrl || 'http://127.0.0.1:8000';
        // Call backend caption endpoint
        const resp = await fetch(`${backendUrl}/snapshot/caption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_url: payload.video_url,
            timestamp_seconds: payload.timestamp_seconds,
            ocr_text: payload.ocr_text || null,
          }),
        });
        let caption = '';
        if (resp.ok) {
          const data = await resp.json();
          caption = data.caption || '';
        }

        // Build snapshot object
        const snapshot = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          videoUrl: payload.video_url,
          title: payload.title || document.title || '',
          timestamp: payload.timestamp || '00:00:00',
          timestampSeconds: payload.timestamp_seconds || 0,
          imageDataUrl: payload.image_data_url,
          caption: caption,
          transcriptContext: '',
          createdAt: new Date().toISOString(),
        };

        // Persist in chrome.storage.local under key snapshots_{videoId}
        const videoId = (() => {
          try {
            const m = (payload.video_url || '').match(/(?:v=|youtu\.be\/)([^&?#]+)/);
            return m ? m[1] : (payload.video_url || '').replace(/[^a-z0-9]/gi, '_').slice(0, 32);
          } catch (e) { return 'unknown'; }
        })();

        const key = `snapshots_${videoId}`;
        chrome.storage.local.get([key], (res) => {
          const existing = res[key] || [];
          existing.push(snapshot);
          const obj = {};
          obj[key] = existing;
          chrome.storage.local.set(obj, () => {
            sendResponse({ ok: true, data: snapshot });
          });
        });
      } catch (err) {
        console.error('[SiteSage] SMART_SNAPSHOT_CAPTURE error', err);
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // async
  }

  if (action === 'SMART_SNAPSHOT_SAVE') {
    // Save/overwrite a snapshot payload
    (async () => {
      try {
        const s = payload; // expects id and videoUrl
        const videoId = (() => {
          try { const m = (s.videoUrl || '').match(/(?:v=|youtu\.be\/)([^&?#]+)/); return m ? m[1] : (s.videoUrl || '').replace(/[^a-z0-9]/gi, '_').slice(0, 32); } catch (e) { return 'unknown'; }
        })();
        const key = `snapshots_${videoId}`;
        chrome.storage.local.get([key], (res) => {
          const list = res[key] || [];
          const idx = list.findIndex(x => x.id === s.id);
          if (idx >= 0) list[idx] = s; else list.push(s);
          const obj = {};
          obj[key] = list;
          chrome.storage.local.set(obj, () => sendResponse({ ok: true, data: s }));
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (action === 'EXPORT_PDF') {
    (async () => {
      try {
        const { videoUrl } = payload || {};
        const backendUrl = payload.backendUrl || 'http://127.0.0.1:8000';

        // If snapshots were provided in the payload (selected by popup), use them directly.
        let snapshotsToSend = payload && payload.snapshots;
        const videoId = (() => { try { const m = (videoUrl || '').match(/(?:v=|youtu\.be\/)([^&?#]+)/); return m ? m[1] : (videoUrl || '').replace(/[^a-z0-9]/gi, '_').slice(0, 32); } catch (e) { return 'unknown'; } })();

        if (!snapshotsToSend || !snapshotsToSend.length) {
          const key = `snapshots_${videoId}`;
          const res = await new Promise((resolve) => chrome.storage.local.get([key], resolve));
          const list = (res && res[key]) || [];
          if (!list.length) { sendResponse({ ok: false, error: 'No snapshots found' }); return; }
          snapshotsToSend = list;
        }

        // Send to backend export endpoint
        const resp = await fetch(`${backendUrl}/snapshots/export_pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshots: snapshotsToSend, videoUrl }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          sendResponse({ ok: false, error: `Export failed: ${text}` });
          return;
        }
        const arrayBuffer = await resp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const dataUrl = 'data:application/pdf;base64,' + b64;
        // Trigger download
        chrome.downloads.download({ url: dataUrl, filename: `sitesage_snapshots_${videoId}.pdf` }, (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ ok: true, data: { downloadId } });
        });
      } catch (err) {
        console.error('[SiteSage] EXPORT_PDF error', err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});


// chrome.action.onClicked.addListener(async (tab) => {
//   if (!tab?.id) return;

//   await chrome.sidePanel.open({ tabId: tab.id });
//   await chrome.sidePanel.setOptions({
//     tabId: tab.id,
//     path: "popup.html",
//     enabled: true
//   });
// });



chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "popup.html",
    enabled: true
  });
});