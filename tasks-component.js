/**
 * ga-tasks-component.js
 * Garage Angels — Interactive Task Management Component
 * Self-contained IIFE. Finds <div id="ga-tasks"> and renders task table.
 *
 * Required attributes on container:
 *   data-startup      e.g. "groundcom"
 *   data-accent       e.g. "#2563eb"
 *   data-report-date  e.g. "2026-03-21"
 */
(function () {
  'use strict';

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  const container = document.getElementById('ga-tasks');
  if (!container) return;

  const startup    = container.dataset.startup    || 'startup';
  const accent     = container.dataset.accent     || '#2563eb';
  const reportDate = container.dataset.reportDate || new Date().toISOString().slice(0, 10);

  // ── Constants ────────────────────────────────────────────────────────────────
  const REPO      = 'filipensky-spec/portfolio-reporting';
  const DATA_FILE = 'data/tasks-' + startup + '.json';
  const GH_API    = 'https://api.github.com';
  const PAT_KEY   = 'ga-github-pat';
  const LOCAL_KEY = 'ga-tasks-' + startup;

  let ghSha = null;
  let tasks  = [];
  let activeTab = 'active'; // 'active' | 'archive'
  let saveTimer = null;

  // ── CSS Injection ─────────────────────────────────────────────────────────────
  (function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root { --task-accent: ${accent}; }

      /* Scoped wrapper */
      #ga-tasks {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      .ga-tasks-card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
        margin: 0;
      }

      /* Header */
      .ga-tasks-header {
        padding: 20px 24px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 1px solid #e5e7eb;
        flex-wrap: wrap;
        gap: 12px;
      }
      .ga-tasks-header-left {}
      .ga-tasks-section-label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--task-accent);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin-bottom: 4px;
      }
      .ga-tasks-title {
        font-size: 22px;
        font-weight: 800;
        color: #111827;
        letter-spacing: -0.5px;
        line-height: 1.2;
      }
      .ga-tasks-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* Tabs */
      .ga-tasks-tabs {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .ga-tasks-tab {
        font-size: 13px;
        font-weight: 500;
        padding: 6px 14px;
        border-radius: 8px;
        cursor: pointer;
        border: none;
        background: transparent;
        color: #6b7280;
        font-family: inherit;
        transition: background 0.15s, color 0.15s;
      }
      .ga-tasks-tab:hover { background: #f3f4f6; color: #374151; }
      .ga-tasks-tab.active {
        background: color-mix(in srgb, var(--task-accent) 12%, white);
        color: var(--task-accent);
        font-weight: 600;
      }

      /* Add button */
      .ga-tasks-add-btn {
        padding: 8px 16px;
        border-radius: 8px;
        background: var(--task-accent);
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        font-family: inherit;
        transition: opacity 0.15s;
        white-space: nowrap;
      }
      .ga-tasks-add-btn:hover { opacity: 0.88; }

      /* Table */
      .ga-tasks-table-wrap { overflow-x: auto; }
      .ga-tasks-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .ga-tasks-table thead tr {
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
      }
      .ga-tasks-table th {
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #9ca3af;
        text-align: left;
      }
      .ga-tasks-table td {
        padding: 6px 12px;
        border-bottom: 1px solid #f3f4f6;
        font-size: 13px;
        vertical-align: middle;
        color: #374151;
        height: 36px;
      }
      .ga-tasks-table tbody tr:last-child td { border-bottom: none; }
      .ga-tasks-table tbody tr:hover { background: #f9fafb; }
      .ga-tasks-table tbody tr.ga-tasks-row-done { background: #f0fdf4; }
      .ga-tasks-table tbody tr.ga-tasks-row-done .ga-tasks-cell-title-text {
        text-decoration: line-through;
        color: #9ca3af;
      }

      /* Checkbox */
      .ga-tasks-checkbox {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 2px solid #d1d5db;
        background: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s, border-color 0.15s;
      }
      .ga-tasks-checkbox.checked {
        background: var(--task-accent);
        border-color: var(--task-accent);
      }
      .ga-tasks-checkbox svg { display: none; }
      .ga-tasks-checkbox.checked svg { display: block; }

      /* Priority */
      .ga-tasks-priority {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
      }
      .ga-tasks-priority-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .ga-tasks-priority[data-priority="high"]   .ga-tasks-priority-dot { background: #ef4444; }
      .ga-tasks-priority[data-priority="medium"] .ga-tasks-priority-dot { background: #f59e0b; }
      .ga-tasks-priority[data-priority="low"]    .ga-tasks-priority-dot { background: #6b7280; }
      .ga-tasks-priority[data-priority="high"]   { color: #ef4444; }
      .ga-tasks-priority[data-priority="medium"] { color: #d97706; }
      .ga-tasks-priority[data-priority="low"]    { color: #6b7280; }

      /* Deadline */
      .ga-tasks-deadline {
        cursor: pointer;
        white-space: nowrap;
        position: relative;
      }
      .ga-tasks-deadline.overdue { color: #ef4444; font-weight: 600; }
      .ga-tasks-deadline-input-wrap {
        position: absolute;
        top: 0; left: 0;
        opacity: 0;
        pointer-events: none;
        width: 0; height: 0;
        overflow: hidden;
      }
      .ga-tasks-deadline-input-wrap input[type="date"] {
        position: absolute;
        top: 0; left: 0;
        width: 0; height: 0;
      }

      /* Inline edit input */
      .ga-tasks-inline-input {
        border: none;
        background: transparent;
        font-family: inherit;
        font-size: 13px;
        color: #111827;
        width: 100%;
        outline: none;
        padding: 0;
        margin: 0;
      }
      .ga-tasks-inline-input:focus {
        border-bottom: 1px solid var(--task-accent);
      }

      /* Trash icon */
      .ga-tasks-delete-btn {
        opacity: 0;
        cursor: pointer;
        background: none;
        border: none;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
        color: #9ca3af;
        transition: opacity 0.15s, color 0.15s;
        font-family: inherit;
      }
      .ga-tasks-table tbody tr:hover .ga-tasks-delete-btn { opacity: 1; }
      .ga-tasks-delete-btn:hover { color: #ef4444; background: #fef2f2; }

      /* Empty state */
      .ga-tasks-empty {
        text-align: center;
        padding: 40px 24px;
        color: #9ca3af;
        font-size: 14px;
      }
      .ga-tasks-empty-add {
        display: inline-block;
        margin-top: 12px;
        padding: 7px 16px;
        border-radius: 8px;
        border: 1px dashed #d1d5db;
        background: transparent;
        color: #6b7280;
        font-size: 13px;
        cursor: pointer;
        font-family: inherit;
        transition: border-color 0.15s, color 0.15s;
      }
      .ga-tasks-empty-add:hover { border-color: var(--task-accent); color: var(--task-accent); }

      /* Toast */
      .ga-tasks-toast {
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

      /* Done check icon in priority col */
      .ga-tasks-done-check { color: #10b981; font-size: 16px; }
    `;
    document.head.appendChild(style);
  })();

  // ── Utility ──────────────────────────────────────────────────────────────────
  function genId() {
    return 't-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function formatDeadline(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    const currentYear = new Date().getFullYear();
    if (y === currentYear) return d + '.' + m + '.';
    return d + '.' + m + '.' + String(y).slice(2) + '';
  }

  function isOverdue(iso) {
    if (!iso) return false;
    return iso < today();
  }

  const PRIORITY_LABELS = { high: 'VYSOKÁ', medium: 'STŘEDNÍ', low: 'NÍZKÁ' };
  const PRIORITY_CYCLE  = { high: 'medium', medium: 'low', low: 'high' };

  // ── GitHub Persistence ────────────────────────────────────────────────────────
  function getGitHubPAT() { return localStorage.getItem(PAT_KEY); }
  function setGitHubPAT(t) { localStorage.setItem(PAT_KEY, t); }

  async function validatePAT(token) {
    try {
      return (await fetch(`${GH_API}/user`, { headers: { Authorization: `token ${token}` } })).ok;
    } catch { return false; }
  }

  function showPATDialog() {
    const existing = document.getElementById('pat-dialog');
    if (existing) existing.remove();
    const d = document.createElement('div');
    d.id = 'pat-dialog';
    d.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;"><div style="background:white;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:Inter,sans-serif;"><h3 style="margin-bottom:8px;font-size:18px;">GitHub Token</h3><p style="color:#6b7280;font-size:14px;margin-bottom:16px;">Pro ukládání změn zadej GitHub Personal Access Token.</p><input id="pat-input" type="password" placeholder="ghp_..." style="width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:12px;"><div id="pat-error" style="color:#ef4444;font-size:13px;margin-bottom:12px;display:none;">Neplatný token</div><div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById('pat-dialog').remove()" style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-family:inherit;font-size:13px;">Zrušit</button><button onclick="window._submitPAT()" style="padding:8px 16px;border:none;border-radius:8px;background:#2563eb;color:white;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Ověřit a uložit</button></div></div></div>`;
    document.body.appendChild(d);
    document.getElementById('pat-input').focus();
  }

  window._submitPAT = async function () {
    const input = document.getElementById('pat-input');
    const err   = document.getElementById('pat-error');
    const token = input.value.trim();
    if (!token) return;
    input.disabled = true;
    if (await validatePAT(token)) {
      setGitHubPAT(token);
      document.getElementById('pat-dialog').remove();
      showToast('Token uložen');
    } else {
      err.style.display = 'block';
      input.disabled = false;
    }
  };

  async function fetchFromGitHub() {
    try {
      const r = await fetch(
        `${GH_API}/repos/${REPO}/contents/${DATA_FILE}`,
        { headers: { Accept: 'application/vnd.github.v3+json' }, cache: 'no-store' }
      );
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
        const r = await fetch(
          `${GH_API}/repos/${REPO}/contents/${DATA_FILE}`,
          { headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${token}` }, cache: 'no-store' }
        );
        if (r.ok) ghSha = (await r.json()).sha;
      }
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
      const body = {
        message: `Update tasks-${startup} ${new Date().toISOString().slice(0, 16)}`,
        content: encoded
      };
      if (ghSha) body.sha = ghSha;
      const r = await fetch(
        `${GH_API}/repos/${REPO}/contents/${DATA_FILE}`,
        {
          method: 'PUT',
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );
      if (r.ok) { ghSha = (await r.json()).content.sha; return true; }
      return false;
    } catch { return false; }
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ga-tasks-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ── Persistence helpers ───────────────────────────────────────────────────────
  function saveLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ tasks }));
  }

  function debouncedSave() {
    saveLocal();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!getGitHubPAT()) {
        showPATDialog();
        // After PAT is set, retry save
        const waitForPAT = setInterval(async () => {
          if (getGitHubPAT()) {
            clearInterval(waitForPAT);
            const ok = await saveToGitHub({ tasks });
            showToast(ok ? 'Uloženo do GitHubu' : 'Chyba při ukládání');
          }
        }, 500);
        // Stop waiting after 60s
        setTimeout(() => clearInterval(waitForPAT), 60000);
        return;
      }
      const ok = await saveToGitHub({ tasks });
      if (ok) showToast('Uloženo do GitHubu');
      else showToast('Chyba při ukládání — zkontroluj token');
    }, 800);
  }

  async function loadData() {
    const ghData = await fetchFromGitHub();
    if (ghData && Array.isArray(ghData.tasks)) {
      tasks = ghData.tasks;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(ghData));
    } else {
      const saved = localStorage.getItem(LOCAL_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.tasks)) tasks = parsed.tasks;
        } catch {}
      }
    }
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    const active  = tasks.filter(t => !t.done);
    const archive = tasks.filter(t => t.done);
    const shown   = activeTab === 'active' ? active : archive;

    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'ga-tasks-card';

    // Header
    const header = document.createElement('div');
    header.className = 'ga-tasks-header';
    header.innerHTML = `
      <div class="ga-tasks-header-left">
        <span class="ga-tasks-section-label">Next Steps</span>
        <div class="ga-tasks-title">Akční kroky</div>
      </div>
      <div class="ga-tasks-header-right">
        <div class="ga-tasks-tabs">
          <button class="ga-tasks-tab ${activeTab === 'active' ? 'active' : ''}" data-tab="active">
            Aktivní (${active.length})
          </button>
          <button class="ga-tasks-tab ${activeTab === 'archive' ? 'active' : ''}" data-tab="archive">
            Archiv (${archive.length})
          </button>
        </div>
        <button class="ga-tasks-add-btn">+ Přidat úkol</button>
      </div>
    `;
    card.appendChild(header);

    // Tab switching
    header.querySelectorAll('.ga-tasks-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    // Add button
    header.querySelector('.ga-tasks-add-btn').addEventListener('click', () => addTask());

    // Table or empty
    const tableWrap = document.createElement('div');
    tableWrap.className = 'ga-tasks-table-wrap';

    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ga-tasks-empty';
      empty.innerHTML = `
        <div>Žádné akční kroky</div>
        ${activeTab === 'active' ? `<button class="ga-tasks-empty-add">+ Přidat první úkol</button>` : ''}
      `;
      if (activeTab === 'active') {
        empty.querySelector('.ga-tasks-empty-add').addEventListener('click', () => addTask());
      }
      tableWrap.appendChild(empty);
    } else {
      const table = document.createElement('table');
      table.className = 'ga-tasks-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width:28px;"></th>
            <th>Úkol</th>
            <th style="width:90px;">Zodpovídá</th>
            <th style="width:70px;">Termín</th>
            <th style="width:90px;">Priorita</th>
            <th style="width:28px;"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      shown.forEach(task => tbody.appendChild(buildRow(task)));
      tableWrap.appendChild(table);
    }

    card.appendChild(tableWrap);
    container.appendChild(card);
  }

  function buildRow(task) {
    const tr = document.createElement('tr');
    if (task.done) tr.classList.add('ga-tasks-row-done');

    // Checkbox cell
    const tdCheck = document.createElement('td');
    tdCheck.style.paddingLeft = '14px';
    const checkbox = document.createElement('div');
    checkbox.className = 'ga-tasks-checkbox' + (task.done ? ' checked' : '');
    checkbox.innerHTML = `<svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 3.5L4 6.5L10 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    checkbox.addEventListener('click', () => toggleDone(task));
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // Title cell
    const tdTitle = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'ga-tasks-cell-title-text';
    titleSpan.textContent = task.title || '';
    titleSpan.style.cursor = 'text';
    titleSpan.addEventListener('click', () => startInlineEdit(titleSpan, task, 'title'));
    if (task.notes) {
      const noteSpan = document.createElement('span');
      noteSpan.style.cssText = 'display:block;font-size:11px;color:#9ca3af;margin-top:1px;';
      noteSpan.textContent = task.notes;
      tdTitle.appendChild(titleSpan);
      tdTitle.appendChild(noteSpan);
    } else {
      tdTitle.appendChild(titleSpan);
    }
    tr.appendChild(tdTitle);

    // Owner cell
    const tdOwner = document.createElement('td');
    const ownerSpan = document.createElement('span');
    ownerSpan.textContent = task.owner || '—';
    ownerSpan.style.cursor = 'text';
    ownerSpan.style.color = '#6b7280';
    ownerSpan.addEventListener('click', () => startInlineEdit(ownerSpan, task, 'owner'));
    tdOwner.appendChild(ownerSpan);
    tr.appendChild(tdOwner);

    // Deadline cell
    const tdDeadline = document.createElement('td');
    const deadlineSpan = document.createElement('span');
    deadlineSpan.className = 'ga-tasks-deadline';
    if (isOverdue(task.deadline) && !task.done) deadlineSpan.classList.add('overdue');
    deadlineSpan.textContent = formatDeadline(task.deadline);

    // Hidden date input trick
    const inputWrap = document.createElement('div');
    inputWrap.className = 'ga-tasks-deadline-input-wrap';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = task.deadline || '';
    dateInput.addEventListener('change', () => {
      task.deadline = dateInput.value || null;
      debouncedSave();
      render();
    });
    inputWrap.appendChild(dateInput);
    deadlineSpan.appendChild(inputWrap);
    deadlineSpan.addEventListener('click', () => {
      dateInput.style.width = '1px';
      dateInput.style.height = '1px';
      inputWrap.style.pointerEvents = 'auto';
      dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
    });
    tdDeadline.appendChild(deadlineSpan);
    tr.appendChild(tdDeadline);

    // Priority cell
    const tdPriority = document.createElement('td');
    if (task.done) {
      const doneCheck = document.createElement('span');
      doneCheck.className = 'ga-tasks-done-check';
      doneCheck.textContent = '✓';
      tdPriority.appendChild(doneCheck);
    } else {
      const p = document.createElement('span');
      p.className = 'ga-tasks-priority';
      p.dataset.priority = task.priority || 'medium';
      p.innerHTML = `<span class="ga-tasks-priority-dot"></span>${PRIORITY_LABELS[task.priority] || 'STŘEDNÍ'}`;
      p.addEventListener('click', () => cyclePriority(task));
      tdPriority.appendChild(p);
    }
    tr.appendChild(tdPriority);

    // Delete cell
    const tdDelete = document.createElement('td');
    tdDelete.style.paddingRight = '12px';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ga-tasks-delete-btn';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Smazat úkol';
    deleteBtn.addEventListener('click', () => deleteTask(task));
    tdDelete.appendChild(deleteBtn);
    tr.appendChild(tdDelete);

    return tr;
  }

  // ── Inline Editing ────────────────────────────────────────────────────────────
  function startInlineEdit(span, task, field) {
    const original = task[field] || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ga-tasks-inline-input';
    input.value = original;

    let committed = false;

    function commit() {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      task[field] = val;
      span.textContent = val || '—';
      span.style.display = '';
      if (input.parentNode) input.parentNode.replaceChild(span, input);
      debouncedSave();
    }

    function cancel() {
      if (committed) return;
      committed = true;
      span.textContent = original || '—';
      span.style.display = '';
      if (input.parentNode) input.parentNode.replaceChild(span, input);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    span.style.display = 'none';
    span.parentNode.insertBefore(input, span);
    input.focus();
    input.select();
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  function addTask() {
    if (activeTab !== 'active') {
      activeTab = 'active';
    }
    const newTask = {
      id:              genId(),
      title:           '',
      owner:           'Aleš',
      deadline:        null,
      priority:        'high',
      done:            false,
      createdAt:       new Date().toISOString(),
      createdInReport: reportDate,
      completedAt:     null,
      notes:           ''
    };
    tasks.unshift(newTask);
    debouncedSave();
    render();

    // Focus title of first row
    const firstTitleSpan = container.querySelector('.ga-tasks-cell-title-text');
    if (firstTitleSpan) {
      // Small delay to let render settle
      setTimeout(() => startInlineEdit(firstTitleSpan, newTask, 'title'), 30);
    }
  }

  function toggleDone(task) {
    task.done = !task.done;
    task.completedAt = task.done ? new Date().toISOString() : null;
    debouncedSave();
    render();
  }

  function cyclePriority(task) {
    task.priority = PRIORITY_CYCLE[task.priority] || 'medium';
    debouncedSave();
    render();
  }

  function deleteTask(task) {
    const hasContent = task.title && task.title.trim();
    if (hasContent && !confirm(`Smazat úkol "${task.title}"?`)) return;
    tasks = tasks.filter(t => t.id !== task.id);
    debouncedSave();
    render();
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  // Show skeleton immediately, then load
  container.innerHTML = '<div class="ga-tasks-card"><div style="padding:24px;color:#9ca3af;font-size:13px;font-family:Inter,sans-serif;">Načítám úkoly…</div></div>';
  loadData();

})();
