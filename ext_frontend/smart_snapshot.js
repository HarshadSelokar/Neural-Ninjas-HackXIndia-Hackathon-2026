// Smart Snapshot content script
(function () {
  const BUTTON_ID = 'sitesage-smart-snapshot-btn';
  const STYLE_ID = 'sitesage-smart-snapshot-style';

  function formatTime(s) {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return null;
    // add shared styles once
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = `
        .sitesage-ss-btn { display:flex; align-items:center; justify-content:center; width:44px; height:36px; border-radius:10px; border:none; cursor:pointer; background:linear-gradient(90deg,#4f46e5,#7c3aed); color:white; font-size:18px; margin:4px; box-shadow:0 6px 18px rgba(99,102,241,0.28); transition: transform .12s ease, box-shadow .12s ease; }
        .sitesage-ss-btn:hover { transform: translateY(-2px) scale(1.03); box-shadow:0 10px 26px rgba(99,102,241,0.34); }
        .sitesage-ss-btn:active { transform: translateY(0) scale(.98); }
        .sitesage-ss-btn .label { font-size:11px; margin-left:6px; font-weight:700; letter-spacing:-0.2px; }

        .sitesage-ss-modal-overlay { position:fixed; inset:0; background:rgba(3,7,18,0.5); display:flex; align-items:center; justify-content:center; z-index:2147483648; }
        .sitesage-ss-card { width:560px; max-width:94%; background:linear-gradient(180deg,#ffffff,#fbfbff); border-radius:12px; padding:18px; box-shadow:0 18px 60px rgba(2,6,23,0.6); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
        .sitesage-ss-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
        .sitesage-ss-title { font-size:16px; font-weight:800; color:#0f172a; }
        .sitesage-ss-ts { font-size:12px; color:#475569; }
        .sitesage-ss-img { width:100%; border-radius:8px; object-fit:cover; margin-bottom:12px; }
        .sitesage-ss-caption { width:95%; min-height:64px; max-height:180px; resize:vertical; padding:10px 12px; font-size:14px; border-radius:8px; border:1px solid #e6eef8; box-shadow:inset 0 1px 0 rgba(255,255,255,0.6); margin-bottom:12px; }
        .sitesage-ss-footer { display:flex; justify-content:flex-end; gap:8px; }
        .sitesage-ss-btn-primary { background:linear-gradient(90deg,#06b6d4,#6366f1); color:white; border:none; padding:8px 12px; border-radius:8px; font-weight:700; cursor:pointer; }
        .sitesage-ss-btn-secondary { background:transparent; color:#0f172a; border:1px solid #e6eef8; padding:8px 12px; border-radius:8px; cursor:pointer; }
      `;
      document.head.appendChild(s);
    }

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'sitesage-ss-btn';
    btn.title = 'Smart Snapshot (Alt+S)';
    btn.innerHTML = `<span aria-hidden>📸</span><span class="label" style="display:none">Snap</span>`;
    btn.style.zIndex = 2147483647;
    return btn;
  }

  function tryInjectToYouTube() {
    const rightControls = document.querySelector('.ytp-right-controls');
    const video = document.querySelector('video');
    if (!video) return false;
    const btn = createButton();
    if (!btn) return false;
    btn.addEventListener('click', () => onCapture(video));
    if (rightControls) {
      rightControls.prepend(btn);
      return true;
    }
    // fallback: place as overlay
    const container = video.parentElement;
    btn.style.position = 'absolute';
    btn.style.right = '12px';
    btn.style.bottom = '60px';
    container.style.position = container.style.position || 'relative';
    container.appendChild(btn);
    return true;
  }

  async function onCapture(video) {
    try {
      const canvas = document.createElement('canvas');
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      // limit max size to avoid huge dataurls
      const maxW = 1280;
      const scale = Math.min(1, maxW / w);
      canvas.width = Math.floor(w * scale);
      canvas.height = Math.floor(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const timestampSeconds = video.currentTime || 0;
      const payload = {
        video_url: location.href,
        title: document.title || '',
        timestamp_seconds: timestampSeconds,
        timestamp: formatTime(timestampSeconds),
        image_data_url: dataUrl,
      };
      // Send to background for processing (caption generation + storage)
      chrome.runtime.sendMessage({ action: 'SMART_SNAPSHOT_CAPTURE', payload }, (resp) => {
        if (!resp) return;
        if (resp.ok) {
          showToast('Snapshot saved ✔');
          // show quick-edit modal if caption provided
          if (resp.data && resp.data.caption) {
            openQuickEditModal(resp.data.caption, payload);
          }
        } else {
          showToast('Snapshot failed: ' + (resp.error || 'unknown'));
        }
      });
    } catch (err) {
      console.error('Smart snapshot error', err);
      showToast('Snapshot failed — see console');
    }
  }

  function showToast(text) {
    const id = 'sitesage-snapshot-toast';
    let t = document.getElementById(id);
    if (!t) {
      t = document.createElement('div');
      t.id = id;
      t.style.position = 'fixed';
      t.style.right = '18px';
      t.style.bottom = '18px';
      t.style.zIndex = 2147483647;
      t.style.padding = '10px 14px';
      t.style.borderRadius = '8px';
      t.style.background = '#dcfce7';
      t.style.color = '#064e3b';
      t.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.opacity = '1';
    setTimeout(() => {
      t.style.transition = 'opacity 400ms';
      t.style.opacity = '0';
    }, 1800);
  }

  function openQuickEditModal(caption, payload) {
    // simple modal near center
    const id = 'sitesage-snapshot-modal';
    if (document.getElementById(id)) return;
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'sitesage-ss-modal-overlay';

    const card = document.createElement('div');
    card.className = 'sitesage-ss-card';

    const header = document.createElement('div');
    header.className = 'sitesage-ss-header';
    const title = document.createElement('div');
    title.className = 'sitesage-ss-title';
    title.textContent = 'Smart Snapshot';
    const ts = document.createElement('div');
    ts.className = 'sitesage-ss-ts';
    ts.textContent = payload.timestamp || '';
    header.appendChild(title);
    header.appendChild(ts);

    const img = document.createElement('img');
    img.className = 'sitesage-ss-img';
    img.src = payload.image_data_url;

    const input = document.createElement('textarea');
    input.className = 'sitesage-ss-caption';
    input.value = caption || '';
    input.placeholder = 'Write a concise 1–2 line study caption (editable)...';

    const footer = document.createElement('div');
    footer.className = 'sitesage-ss-footer';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'sitesage-ss-btn-secondary';
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => document.body.removeChild(overlay));

    const btnSave = document.createElement('button');
    btnSave.className = 'sitesage-ss-btn-primary';
    btnSave.textContent = 'Save Snapshot';
    btnSave.addEventListener('click', () => {
      const updated = Object.assign({}, payload, { caption: input.value });
      chrome.runtime.sendMessage({ action: 'SMART_SNAPSHOT_SAVE', payload: updated }, (r) => {
        showToast('Snapshot updated ✔');
        document.body.removeChild(overlay);
      });
    });

    footer.appendChild(btnCancel);
    footer.appendChild(btnSave);

    card.appendChild(header);
    card.appendChild(img);
    card.appendChild(input);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // keyboard shortcut listener (Alt+S)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's') {
      const video = document.querySelector('video');
      if (video) onCapture(video);
    }
  });

  // MutationObserver to inject when player appears
  const observer = new MutationObserver(() => {
    tryInjectToYouTube();
  });
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // initial attempt
  tryInjectToYouTube();
})();
