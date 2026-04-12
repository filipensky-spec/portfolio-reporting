/**
 * ga-edit-component.js
 * Garage Angels — Inline Text Editing with GitHub Persistence
 *
 * Usage: Add to any report page:
 *   <div id="ga-edit" data-startup="groundcom" data-report="2026-03-21"></div>
 *   <script src="https://filipensky-spec.github.io/portfolio-reporting/edit-component.js"></script>
 *
 * Creates a floating pencil button. Click to enter edit mode.
 * All text elements become editable. Changes save to GitHub automatically.
 * Only the person with the PAT can save. Others see saved changes on load.
 */
(function () {
  'use strict';

  const el = document.getElementById('ga-edit');
  if (!el) return;

  const startup = el.dataset.startup || 'unknown';
  const report  = el.dataset.report  || 'default';

  const REPO      = 'filipensky-spec/portfolio-reporting';
  const DATA_FILE = `data/edits-${startup}-${report}.json`;
  const GH_API    = 'https://api.github.com';
  const PAT_KEY   = 'ga-github-pat';
  const LOCAL_KEY = `ga-edits-${startup}-${report}`;

  // Selector for editable text elements
  const TEXT_SEL = 'p, h1, h2, h3, h4, h5, li, td, th, blockquote, figcaption, .section-title, .section-label, .section-desc, .hero-subtitle, .card-desc, .card-title, .info-value, .info-label, .highlight-box, .talking-points li, .callout, .callout-title';

  let ghSha = null;
  let isEditing = false;
  let originalTexts = {};
  let savedEdits = {};
  let editElements = []; // Store element refs from when edit mode started

  // ── Inject CSS ───────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .ga-edit-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #2563eb;
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(37,99,235,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9990;
      transition: all 0.2s;
      font-size: 20px;
      font-family: inherit;
    }
    .ga-edit-fab:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(37,99,235,0.5); }
    .ga-edit-fab.active { background: #10b981; }

    .ga-edit-bar {
      display: none;
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9991;
      background: #1f2937;
      color: white;
      padding: 12px 24px;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      gap: 12px;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      font-family: 'Inter', sans-serif;
    }
    .ga-edit-bar.visible { display: flex; }
    .ga-edit-bar button {
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      border: none;
    }
    .ga-edit-bar .btn-save { background: #10b981; color: white; }
    .ga-edit-bar .btn-save:hover { background: #059669; }
    .ga-edit-bar .btn-cancel { background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); }
    .ga-edit-bar .btn-cancel:hover { background: rgba(255,255,255,0.1); }

    body.ga-editing .ga-edit-target {
      outline: 2px dashed rgba(37,99,235,0.3);
      outline-offset: 2px;
      border-radius: 3px;
      cursor: text;
      min-height: 1em;
    }
    body.ga-editing .ga-edit-target:focus {
      outline: 2px solid #2563eb;
      background: rgba(37,99,235,0.04);
    }
    body.ga-editing .ga-edit-target:hover {
      background: rgba(37,99,235,0.02);
    }

    .ga-edit-toast {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: white;
      padding: 10px 24px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      font-family: 'Inter', sans-serif;
      pointer-events: none;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  // ── GitHub Persistence ───────────────────────────────────────────────────
  function getGitHubPAT() { return localStorage.getItem(PAT_KEY); }
  function setGitHubPAT(t) { localStorage.setItem(PAT_KEY, t); }

  async function validatePAT(token) {
    try { return (await fetch(`${GH_API}/user`, { headers: { Authorization: `token ${token}` } })).ok; }
    catch { return false; }
  }

  function showPATDialog() {
    const existing = document.getElementById('ga-pat-dialog');
    if (existing) existing.remove();
    const d = document.createElement('div');
    d.id = 'ga-pat-dialog';
    d.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;"><div style="background:white;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:Inter,sans-serif;"><h3 style="margin-bottom:8px;font-size:18px;color:#111827;">GitHub Token</h3><p style="color:#6b7280;font-size:14px;margin-bottom:16px;">Pro ukládání změn zadej GitHub Personal Access Token.</p><input id="ga-pat-input" type="password" placeholder="ghp_..." style="width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:12px;color:#111827;"><div id="ga-pat-error" style="color:#ef4444;font-size:13px;margin-bottom:12px;display:none;">Neplatný token</div><div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById('ga-pat-dialog').remove()" style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-family:inherit;font-size:13px;color:#374151;">Zrušit</button><button onclick="window._gaEditSubmitPAT()" style="padding:8px 16px;border:none;border-radius:8px;background:#2563eb;color:white;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Ověřit a uložit</button></div></div></div>`;
    document.body.appendChild(d);
    document.getElementById('ga-pat-input').focus();
  }

  window._gaEditSubmitPAT = async function () {
    const input = document.getElementById('ga-pat-input');
    const err = document.getElementById('ga-pat-error');
    const token = input.value.trim();
    if (!token) return;
    input.disabled = true;
    if (await validatePAT(token)) {
      setGitHubPAT(token);
      document.getElementById('ga-pat-dialog').remove();
      showToast('Token uložen');
    } else {
      err.style.display = 'block';
      input.disabled = false;
    }
  };

  async function fetchFromGitHub() {
    try {
      const r = await fetch(`${GH_API}/repos/${REPO}/contents/${DATA_FILE}`, {
        headers: { Accept: 'application/vnd.github.v3+json' }, cache: 'no-store'
      });
      if (!r.ok) return null;
      const json = await r.json();
      ghSha = json.sha;
      return JSON.parse(decodeURIComponent(escape(atob(json.content.replace(/\n/g, '')))));
    } catch { return null; }
  }

  async function saveToGitHub(data) {
    const token = getGitHubPAT();
    if (!token) return false;
    try {
      if (!ghSha) {
        const r = await fetch(`${GH_API}/repos/${REPO}/contents/${DATA_FILE}`, {
          headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${token}` }, cache: 'no-store'
        });
        if (r.ok) ghSha = (await r.json()).sha;
      }
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
      const body = { message: `Update edits ${startup}/${report} ${new Date().toISOString().slice(0, 16)}`, content: encoded };
      if (ghSha) body.sha = ghSha;
      const r = await fetch(`${GH_API}/repos/${REPO}/contents/${DATA_FILE}`, {
        method: 'PUT',
        headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.ok) { ghSha = (await r.json()).content.sha; return true; }
      return false;
    } catch { return false; }
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ga-edit-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ── Text Element Indexing ────────────────────────────────────────────────
  // Generates a stable key for each text element based on tag + index
  function getTextElements() {
    return Array.from(document.querySelectorAll(TEXT_SEL)).filter(el => {
      // Skip elements inside ga-tasks or ga-edit containers
      if (el.closest('#ga-tasks') || el.closest('#ga-edit') || el.closest('.ga-edit-bar') || el.closest('#ga-pat-dialog')) return false;
      // Skip script/style content
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
      // Must have some text
      return el.textContent.trim().length > 0;
    });
  }

  function getElementKey(el, idx) {
    return `${el.tagName.toLowerCase()}-${idx}`;
  }

  // ── Edit Mode ────────────────────────────────────────────────────────────
  function enterEditMode() {
    if (!getGitHubPAT()) {
      showPATDialog();
      // Wait for PAT then retry
      const interval = setInterval(() => {
        if (getGitHubPAT()) {
          clearInterval(interval);
          enterEditMode();
        }
      }, 500);
      setTimeout(() => clearInterval(interval), 60000);
      return;
    }

    isEditing = true;
    document.body.classList.add('ga-editing');
    fab.classList.add('active');
    fab.innerHTML = '✓';
    editBar.classList.add('visible');

    const elements = getTextElements();
    editElements = elements; // Lock element refs for this session
    originalTexts = {};
    elements.forEach((el, idx) => {
      const key = getElementKey(el, idx);
      originalTexts[key] = el.innerHTML;
      el.contentEditable = 'true';
      el.classList.add('ga-edit-target');
    });
  }

  function saveAndExit() {
    const elements = editElements; // Use locked refs, not re-queried list
    const edits = {};
    let hasChanges = false;

    elements.forEach((el, idx) => {
      el.contentEditable = 'false';
      el.classList.remove('ga-edit-target');
      const key = getElementKey(el, idx);
      const current = el.innerHTML;
      // Only store if different from what we loaded (original page or previous saved state)
      if (originalTexts[key] !== undefined && current !== originalTexts[key]) {
        edits[key] = current;
        hasChanges = true;
      } else if (savedEdits[key] !== undefined) {
        // Preserve previously saved edits that weren't changed this session
        edits[key] = savedEdits[key];
      }
    });

    // Merge: keep existing saved edits and overlay new ones
    const merged = { ...savedEdits, ...edits };

    // Remove entries where value matches original (no actual change)
    // Keep it simple — save all that differ
    savedEdits = merged;

    localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));

    // Save to GitHub
    saveToGitHub(merged).then(ok => {
      if (ok) showToast('Uloženo do GitHubu');
      else showToast('Chyba při ukládání — zkontroluj token');
    });

    exitEditMode();
  }

  function cancelEdit() {
    const elements = editElements; // Use locked refs
    elements.forEach((el, idx) => {
      el.contentEditable = 'false';
      el.classList.remove('ga-edit-target');
      const key = getElementKey(el, idx);
      if (originalTexts[key] !== undefined) {
        el.innerHTML = originalTexts[key];
      }
    });
    exitEditMode();
  }

  function exitEditMode() {
    isEditing = false;
    document.body.classList.remove('ga-editing');
    fab.classList.remove('active');
    fab.innerHTML = '✎';
    editBar.classList.remove('visible');
    originalTexts = {};
  }

  // ── Load Saved Edits ────────────────────────────────────────────────────
  async function loadEdits() {
    // Try GitHub first
    const ghData = await fetchFromGitHub();
    if (ghData && typeof ghData === 'object' && Object.keys(ghData).length > 0) {
      savedEdits = ghData;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(ghData));
      applyEdits(ghData);
      return;
    }
    // Fallback to localStorage
    const local = localStorage.getItem(LOCAL_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (typeof parsed === 'object') {
          savedEdits = parsed;
          applyEdits(parsed);
        }
      } catch {}
    }
  }

  function applyEdits(edits) {
    const elements = getTextElements();
    elements.forEach((el, idx) => {
      const key = getElementKey(el, idx);
      if (edits[key] !== undefined) {
        el.innerHTML = edits[key];
      }
    });
  }

  // ── UI Elements ──────────────────────────────────────────────────────────
  // Floating Action Button (pencil)
  const fab = document.createElement('button');
  fab.className = 'ga-edit-fab';
  fab.innerHTML = '✎';
  fab.title = 'Upravit texty';
  fab.addEventListener('click', () => {
    if (isEditing) {
      saveAndExit();
    } else {
      enterEditMode();
    }
  });
  document.body.appendChild(fab);

  // Edit bar
  const editBar = document.createElement('div');
  editBar.className = 'ga-edit-bar';
  editBar.innerHTML = `
    <span>Režim úprav</span>
    <button class="btn-save" id="ga-edit-save">Uložit změny</button>
    <button class="btn-cancel" id="ga-edit-cancel">Zrušit</button>
  `;
  document.body.appendChild(editBar);
  editBar.querySelector('#ga-edit-save').addEventListener('click', saveAndExit);
  editBar.querySelector('#ga-edit-cancel').addEventListener('click', cancelEdit);

  // ── Init ─────────────────────────────────────────────────────────────────
  loadEdits();

})();
