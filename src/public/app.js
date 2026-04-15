const state = {
  index: null,
  runtime: null,
  selectedWorkspaceId: null,
  navMode: "cards",
  readerMode: "story",
  selectedChangeId: null,
  selectedArtifactPath: null,
  compareLeftPath: null,
  compareRightPath: null,
  fileCache: new Map(),
};

const els = {
  workspaceSelect: document.getElementById("workspaceSelect"),
  removeWorkspaceBtn: document.getElementById("removeWorkspaceBtn"),
  clearWorkspacesBtn: document.getElementById("clearWorkspacesBtn"),
  stopServiceBtn: document.getElementById("stopServiceBtn"),
  addWorkspacePath: document.getElementById("addWorkspacePath"),
  addWorkspaceLabel: document.getElementById("addWorkspaceLabel"),
  addWorkspaceBtn: document.getElementById("addWorkspaceBtn"),
  refreshAllBtn: document.getElementById("refreshAllBtn"),
  scanMeta: document.getElementById("scanMeta"),
  runtimeMeta: document.getElementById("runtimeMeta"),
  modeCardsBtn: document.getElementById("modeCardsBtn"),
  modeFilesBtn: document.getElementById("modeFilesBtn"),
  viewStoryBtn: document.getElementById("viewStoryBtn"),
  viewCompareBtn: document.getElementById("viewCompareBtn"),
  navContent: document.getElementById("navContent"),
  readerContent: document.getElementById("readerContent"),
  lensContent: document.getElementById("lensContent"),
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  let html = "";
  let inCode = false;
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```") && !inCode) {
      closeList();
      inCode = true;
      html += "<pre><code>";
      continue;
    }
    if (line.startsWith("```") && inCode) {
      html += "</code></pre>";
      inCode = false;
      continue;
    }
    if (inCode) {
      html += `${escapeHtml(line)}\n`;
      continue;
    }

    if (!line.trim()) {
      closeList();
      html += "<p></p>";
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${escapeHtml(heading[2])}</h${level}>`;
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${escapeHtml(bullet[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${escapeHtml(line)}</p>`;
  }

  closeList();
  if (inCode) {
    html += "</code></pre>";
  }
  return `<div class="markdown">${html}</div>`;
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  });
}

function getSelectedWorkspace() {
  return state.index?.workspaces?.find((ws) => ws.id === state.selectedWorkspaceId) || null;
}

function getSelectedChange(workspace) {
  if (!workspace) return null;
  return workspace.changes.find((c) => c.id === state.selectedChangeId) || null;
}

function getChangeArtifacts(change) {
  if (!change) return [];
  const order = { proposal: 1, design: 2, tasks: 3, spec: 4 };
  return [...change.artifacts].sort((a, b) => {
    const ao = order[a.type] || 99;
    const bo = order[b.type] || 99;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title);
  });
}

async function loadFile(workspaceId, relativePath) {
  const key = `${workspaceId}:${relativePath}`;
  if (state.fileCache.has(key)) {
    return state.fileCache.get(key);
  }
  const data = await api(`/api/file?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(relativePath)}`);
  state.fileCache.set(key, data.content);
  return data.content;
}

function setDefaultSelection() {
  const ws = getSelectedWorkspace();
  if (!ws) return;

  if (!ws.changes.find((c) => c.id === state.selectedChangeId)) {
    state.selectedChangeId = (ws.reviewQueue[0] || ws.changes[0] || {}).id || null;
  }

  const change = getSelectedChange(ws);
  const artifacts = getChangeArtifacts(change);
  if (artifacts.length === 0) {
    state.selectedArtifactPath = null;
    state.compareLeftPath = null;
    state.compareRightPath = null;
    return;
  }

  const paths = new Set(artifacts.map((a) => a.relativePath));
  if (!paths.has(state.selectedArtifactPath)) {
    state.selectedArtifactPath = artifacts[0].relativePath;
  }
  if (!paths.has(state.compareLeftPath)) {
    state.compareLeftPath = artifacts[0].relativePath;
  }
  if (!paths.has(state.compareRightPath)) {
    state.compareRightPath = artifacts[Math.min(1, artifacts.length - 1)].relativePath;
  }
}

function renderWorkspaceBar() {
  const list = state.index?.workspaces || [];
  els.workspaceSelect.innerHTML = "";

  for (const ws of list) {
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = `${ws.label} (${ws.status})`;
    els.workspaceSelect.appendChild(opt);
  }

  if (!list.find((ws) => ws.id === state.selectedWorkspaceId)) {
    state.selectedWorkspaceId = list[0]?.id || null;
  }

  if (state.selectedWorkspaceId) {
    els.workspaceSelect.value = state.selectedWorkspaceId;
  }

  els.scanMeta.textContent = state.index?.generatedAt ? `Last index: ${state.index.generatedAt}` : "";
  if (!state.runtime?.runtime) {
    els.runtimeMeta.textContent = "Service: stopped";
  } else if (state.runtime.running) {
    els.runtimeMeta.textContent = `Service: running on :${state.runtime.runtime.port}`;
  } else {
    els.runtimeMeta.textContent = `Service: stale runtime (pid=${state.runtime.runtime.pid})`;
  }
}

function renderNavigation() {
  const ws = getSelectedWorkspace();
  if (!ws) {
    els.navContent.innerHTML = '<p class="muted">No workspace selected.</p>';
    return;
  }

  if (state.navMode === "files") {
    const rows = ws.files
      .map(
        (file) => `<button class="file-item" data-open-file="${file.relativePath}">${file.relativePath}</button>`
      )
      .join("");
    els.navContent.innerHTML = `<div>${rows || '<p class="muted">No files.</p>'}</div>`;
    return;
  }

  const queueCards = ws.reviewQueue
    .map((change) => {
      const active = change.id === state.selectedChangeId ? "active" : "";
      const progress = `${change.taskProgress.done}/${change.taskProgress.total}`;
      const warn = change.needsReview ? '<span class="badge warn">Needs Review</span>' : '<span class="badge">Stable</span>';
      const missing =
        change.missingArtifacts.length > 0
          ? `<span class="badge error">Missing: ${change.missingArtifacts.join(", ")}</span>`
          : "";
      return `<div class="card ${active}" data-change-id="${change.id}">
        <strong>${change.name}</strong>
        <div class="muted">tasks ${progress}</div>
        <div class="badges">${warn}${missing}</div>
      </div>`;
    })
    .join("");

  const capabilityCards = ws.capabilities
    .map((cap) => {
      return `<button class="card link-btn" data-capability-name="${cap.name}">
        <strong>${cap.name}</strong>
        <div class="muted">changes: ${cap.relatedChanges.length}</div>
      </button>`;
    })
    .join("");

  els.navContent.innerHTML = `
    <h3>Review Queue (Change-first)</h3>
    <div>${queueCards || '<p class="muted">No changes found.</p>'}</div>
    <h3>Capabilities</h3>
    <div>${capabilityCards || '<p class="muted">No capabilities found.</p>'}</div>
  `;
}

async function renderStoryReader(ws, change) {
  if (!change) {
    els.readerContent.innerHTML = '<p class="muted">Select a change to read.</p>';
    return;
  }

  const artifacts = getChangeArtifacts(change);
  if (artifacts.length === 0) {
    els.readerContent.innerHTML = '<p class="muted">No artifacts in this change.</p>';
    return;
  }

  const selected = artifacts.find((a) => a.relativePath === state.selectedArtifactPath) || artifacts[0];
  state.selectedArtifactPath = selected.relativePath;

  const nav = artifacts
    .map((artifact) => {
      const active = artifact.relativePath === selected.relativePath ? "active" : "";
      return `<button class="card link-btn ${active}" data-artifact-path="${artifact.relativePath}">
        <strong>${artifact.title}</strong>
        <div class="muted">${artifact.relativePath}</div>
      </button>`;
    })
    .join("");

  let content = "";
  try {
    content = await loadFile(ws.id, selected.relativePath);
  } catch (error) {
    content = `Failed to load file: ${error.message}`;
  }

  els.readerContent.innerHTML = `
    <div class="readonly">Read-only preview</div>
    <div class="reader-grid">
      <div>${nav}</div>
      <div class="preview-pane">${renderMarkdown(content)}</div>
    </div>
  `;
}

async function renderCompareReader(ws, change) {
  if (!change) {
    els.readerContent.innerHTML = '<p class="muted">Select a change to compare artifacts.</p>';
    return;
  }

  const artifacts = getChangeArtifacts(change);
  if (artifacts.length === 0) {
    els.readerContent.innerHTML = '<p class="muted">No artifacts in this change.</p>';
    return;
  }

  const options = artifacts
    .map((artifact) => `<option value="${artifact.relativePath}">${artifact.title}</option>`)
    .join("");

  const leftPath = state.compareLeftPath || artifacts[0].relativePath;
  const rightPath = state.compareRightPath || artifacts[Math.min(1, artifacts.length - 1)].relativePath;

  let left = "";
  let right = "";
  try {
    left = await loadFile(ws.id, leftPath);
  } catch (error) {
    left = `Failed to load left artifact: ${error.message}`;
  }
  try {
    right = await loadFile(ws.id, rightPath);
  } catch (error) {
    right = `Failed to load right artifact: ${error.message}`;
  }

  els.readerContent.innerHTML = `
    <div class="readonly">Read-only compare view</div>
    <div class="compare-controls">
      <label>Left</label>
      <select id="leftSelect">${options}</select>
      <label>Right</label>
      <select id="rightSelect">${options}</select>
    </div>
    <div class="compare-grid">
      <div class="compare-pane">${renderMarkdown(left)}</div>
      <div class="compare-pane">${renderMarkdown(right)}</div>
    </div>
  `;

  document.getElementById("leftSelect").value = leftPath;
  document.getElementById("rightSelect").value = rightPath;
}

function renderCapabilityLens() {
  const ws = getSelectedWorkspace();
  if (!ws) {
    els.lensContent.innerHTML = '<p class="muted">No workspace selected.</p>';
    return;
  }

  const change = getSelectedChange(ws);
  const impacted = (change?.impactedCapabilities || [])
    .map(
      (name) => `<button class="link-btn" data-capability-name="${name}">- ${name}</button>`
    )
    .join("");

  const groupedByWorkspace = (state.index?.workspaces || [])
    .map((workspace) => {
      const capItems = workspace.capabilities
        .map(
          (cap) => `<li><button class="link-btn" data-capability-name="${cap.name}">${cap.name}</button></li>`
        )
        .join("");
      return `<div class="card">
        <strong>${workspace.label}</strong>
        <ul>${capItems || "<li class='muted'>No capabilities</li>"}</ul>
      </div>`;
    })
    .join("");

  els.lensContent.innerHTML = `
    <h3>Impacted by Current Change</h3>
    <div>${impacted || '<p class="muted">No impacted capability.</p>'}</div>
    <h3>Global Capability Overview</h3>
    <div>${groupedByWorkspace || '<p class="muted">No workspace data.</p>'}</div>
  `;
}

async function renderReader() {
  const ws = getSelectedWorkspace();
  const change = getSelectedChange(ws);
  if (!ws) {
    els.readerContent.innerHTML = '<p class="muted">No workspace selected.</p>';
    return;
  }

  if (state.readerMode === "compare") {
    await renderCompareReader(ws, change);
  } else {
    await renderStoryReader(ws, change);
  }
}

async function rerender() {
  setDefaultSelection();
  renderWorkspaceBar();
  renderNavigation();
  renderCapabilityLens();
  await renderReader();
  bindDynamicEvents();
  syncButtonStates();
}

function syncButtonStates() {
  els.modeCardsBtn.classList.toggle("active", state.navMode === "cards");
  els.modeFilesBtn.classList.toggle("active", state.navMode === "files");
  els.viewStoryBtn.classList.toggle("active", state.readerMode === "story");
  els.viewCompareBtn.classList.toggle("active", state.readerMode === "compare");
}

function jumpToCapability(name) {
  const ws = getSelectedWorkspace();
  if (!ws) return;

  const change = getSelectedChange(ws);
  const fromChange = getChangeArtifacts(change).find((artifact) => artifact.type === "spec" && artifact.capability === name);
  if (fromChange) {
    state.selectedArtifactPath = fromChange.relativePath;
    state.readerMode = "story";
    rerender();
    return;
  }

  const capability = ws.capabilities.find((item) => item.name === name);
  if (capability?.currentSpecRelativePath) {
    state.selectedArtifactPath = capability.currentSpecRelativePath;
    state.readerMode = "story";
    rerender();
  }
}

function bindDynamicEvents() {
  for (const el of document.querySelectorAll("[data-change-id]")) {
    el.addEventListener("click", () => {
      state.selectedChangeId = el.dataset.changeId;
      state.readerMode = "story";
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-artifact-path]")) {
    el.addEventListener("click", () => {
      state.selectedArtifactPath = el.dataset.artifactPath;
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-open-file]")) {
    el.addEventListener("click", () => {
      state.selectedArtifactPath = el.dataset.openFile;
      state.readerMode = "story";
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-capability-name]")) {
    el.addEventListener("click", () => {
      jumpToCapability(el.dataset.capabilityName);
    });
  }

  const leftSelect = document.getElementById("leftSelect");
  const rightSelect = document.getElementById("rightSelect");
  if (leftSelect && rightSelect) {
    leftSelect.addEventListener("change", () => {
      state.compareLeftPath = leftSelect.value;
      rerender();
    });
    rightSelect.addEventListener("change", () => {
      state.compareRightPath = rightSelect.value;
      rerender();
    });
  }
}

async function refreshIndex(workspaceId = null) {
  await api("/api/workspaces/refresh", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  await loadIndex();
}

async function loadIndex() {
  const [indexData, runtimeData] = await Promise.all([api("/api/index"), api("/api/runtime/status")]);
  state.index = indexData;
  state.runtime = runtimeData;
  await rerender();
}

function bindStaticEvents() {
  els.workspaceSelect.addEventListener("change", () => {
    state.selectedWorkspaceId = els.workspaceSelect.value;
    state.selectedChangeId = null;
    state.selectedArtifactPath = null;
    state.compareLeftPath = null;
    state.compareRightPath = null;
    rerender();
  });

  els.modeCardsBtn.addEventListener("click", () => {
    state.navMode = "cards";
    rerender();
  });

  els.modeFilesBtn.addEventListener("click", () => {
    state.navMode = "files";
    rerender();
  });

  els.viewStoryBtn.addEventListener("click", () => {
    state.readerMode = "story";
    rerender();
  });

  els.viewCompareBtn.addEventListener("click", () => {
    state.readerMode = "compare";
    rerender();
  });

  els.refreshAllBtn.addEventListener("click", async () => {
    await refreshIndex();
  });

  els.removeWorkspaceBtn.addEventListener("click", async () => {
    if (!state.selectedWorkspaceId) return;
    await api(`/api/workspaces/${encodeURIComponent(state.selectedWorkspaceId)}`, { method: "DELETE" });
    state.selectedWorkspaceId = null;
    state.selectedChangeId = null;
    state.selectedArtifactPath = null;
    await loadIndex();
  });

  els.clearWorkspacesBtn.addEventListener("click", async () => {
    if (!confirm("Clear all linked workspaces?")) return;
    await api("/api/workspaces", { method: "DELETE" });
    state.selectedWorkspaceId = null;
    state.selectedChangeId = null;
    state.selectedArtifactPath = null;
    await loadIndex();
  });

  els.stopServiceBtn.addEventListener("click", async () => {
    if (!confirm("Stop spec-readr web service now?")) return;
    await api("/api/runtime/stop", { method: "POST", body: JSON.stringify({}) });
    els.runtimeMeta.textContent = "Service: stopping...";
  });

  els.addWorkspaceBtn.addEventListener("click", async () => {
    const targetPath = els.addWorkspacePath.value.trim();
    const label = els.addWorkspaceLabel.value.trim();
    if (!targetPath) return;
    await api("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path: targetPath, label: label || undefined }),
    });
    els.addWorkspacePath.value = "";
    els.addWorkspaceLabel.value = "";
    await loadIndex();
  });
}

bindStaticEvents();
loadIndex().catch((error) => {
  els.readerContent.innerHTML = `<p class="muted">Failed to load: ${escapeHtml(error.message)}</p>`;
});
