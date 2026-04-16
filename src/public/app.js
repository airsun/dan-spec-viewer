const state = {
  index: null,
  runtime: null,
  sync: null,
  timeline: [],
  selectedWorkspaceId: null,
  workspaceQuery: "",
  workspaceDropdownOpen: false,
  navMode: "cards",
  navQuery: "",
  capabilityScope: "change",
  capabilityLensQuery: "",
  readerMode: "story",
  readerFocus: "change",
  selectedChangeId: null,
  selectedCapabilityName: null,
  selectedArtifactPath: null,
  compareLeftPath: null,
  compareRightPath: null,
  fileCache: new Map(),
};

const els = {
  workspaceCombo: document.getElementById("workspaceCombo"),
  workspaceComboWrap: document.getElementById("workspaceComboWrap"),
  workspaceComboToggle: document.getElementById("workspaceComboToggle"),
  workspaceDropdown: document.getElementById("workspaceDropdown"),
  removeWorkspaceBtn: document.getElementById("removeWorkspaceBtn"),
  clearWorkspacesBtn: document.getElementById("clearWorkspacesBtn"),
  stopServiceBtn: document.getElementById("stopServiceBtn"),
  addWorkspacePath: document.getElementById("addWorkspacePath"),
  addWorkspaceLabel: document.getElementById("addWorkspaceLabel"),
  syncAddBtn: document.getElementById("syncAddBtn"),
  refreshWorkspaceBtn: document.getElementById("refreshWorkspaceBtn"),
  refreshAllBtn: document.getElementById("refreshAllBtn"),
  syncStateBadge: document.getElementById("syncStateBadge"),
  syncStateText: document.getElementById("syncStateText"),
  syncPopover: document.getElementById("syncPopover"),
  workspaceMenu: document.getElementById("workspaceMenu"),
  scanMeta: document.getElementById("scanMeta"),
  runtimeMeta: document.getElementById("runtimeMeta"),
  modeCardsBtn: document.getElementById("modeCardsBtn"),
  modeFilesBtn: document.getElementById("modeFilesBtn"),
  navSearchInput: document.getElementById("navSearchInput"),
  viewStoryBtn: document.getElementById("viewStoryBtn"),
  viewCompareBtn: document.getElementById("viewCompareBtn"),
  navContent: document.getElementById("navContent"),
  readerContent: document.getElementById("readerContent"),
  lensContent: document.getElementById("lensContent"),
  brandLogo: document.getElementById("brandLogo"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function renderMarkdown(md) {
  const lines = String(md || "").split(/\r?\n/);
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
  if (inCode) html += "</code></pre>";
  return `<div class="markdown">${html}</div>`;
}

function api(url, options = {}) {
  return fetch(url, {
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
  return workspace.changes.find((item) => item.id === state.selectedChangeId) || null;
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

function pickDefaultComparePaths(artifacts) {
  const byType = (type) => artifacts.find((item) => item.type === type)?.relativePath;
  const preferredLeft = byType("design") || artifacts[0]?.relativePath || null;
  const preferredRight =
    byType("tasks") || artifacts.find((item) => item.relativePath !== preferredLeft)?.relativePath || preferredLeft;
  return { preferredLeft, preferredRight };
}

function findChangeByArtifactPath(workspace, relativePath) {
  if (!workspace || !relativePath) return null;
  return workspace.changes.find((change) =>
    change.artifacts.some((artifact) => artifact.relativePath === relativePath)
  );
}

async function loadFile(workspaceId, relativePath) {
  const key = `${workspaceId}:${relativePath}`;
  if (state.fileCache.has(key)) return state.fileCache.get(key);
  const data = await api(
    `/api/file?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(relativePath)}`
  );
  state.fileCache.set(key, data.content);
  return data.content;
}

function setDefaultSelection() {
  const ws = getSelectedWorkspace();
  if (!ws) return;

  if (!ws.changes.find((item) => item.id === state.selectedChangeId)) {
    state.selectedChangeId = (ws.reviewQueue[0] || ws.changes[0] || {}).id || null;
  }
  const capabilityNames = new Set(ws.capabilities.map((cap) => cap.name));
  if (state.selectedCapabilityName && !capabilityNames.has(state.selectedCapabilityName)) {
    state.selectedCapabilityName = null;
  }

  const selectedChange = getSelectedChange(ws);
  if (!state.selectedCapabilityName) {
    const hinted = selectedChange?.impactedCapabilities?.find((name) => capabilityNames.has(name)) || null;
    state.selectedCapabilityName = hinted;
  }

  const fileExists = ws.files.some((file) => file.relativePath === state.selectedArtifactPath);
  if (state.readerFocus === "file" && fileExists) return;

  const change = getSelectedChange(ws);
  const artifacts = getChangeArtifacts(change);
  if (artifacts.length === 0) {
    state.compareLeftPath = null;
    state.compareRightPath = null;
    if (!fileExists) state.selectedArtifactPath = ws.files[0]?.relativePath || null;
    return;
  }

  const paths = new Set(artifacts.map((item) => item.relativePath));
  if (!paths.has(state.selectedArtifactPath)) {
    state.selectedArtifactPath = artifacts[0].relativePath;
  }

  const defaults = pickDefaultComparePaths(artifacts);
  if (!paths.has(state.compareLeftPath)) state.compareLeftPath = defaults.preferredLeft;
  if (!paths.has(state.compareRightPath)) state.compareRightPath = defaults.preferredRight;
}

function capabilityToken(name) {
  return encodeURIComponent(name);
}

function getCapabilityByName(workspace, name) {
  if (!workspace || !name) return null;
  return workspace.capabilities.find((item) => item.name === name) || null;
}

function getCapabilitySignals(workspace, capabilityName) {
  if (!workspace || !capabilityName) {
    return {
      specCount: 0,
      pendingChanges: 0,
      missingArtifacts: 0,
      latestSpecAt: null,
    };
  }

  let specCount = 0;
  let pendingChanges = 0;
  let missingArtifacts = 0;
  let latestSpecAt = null;

  for (const change of workspace.changes || []) {
    if (!change.impactedCapabilities?.includes(capabilityName)) continue;
    const specHits = (change.artifacts || []).filter((a) => a.type === "spec" && a.capability === capabilityName).length;
    specCount += specHits;
    if (change.needsReview) pendingChanges += 1;
    missingArtifacts += change.missingArtifacts?.length || 0;

    if (!latestSpecAt || (change.lastModified || "") > latestSpecAt) {
      latestSpecAt = change.lastModified || latestSpecAt;
    }
  }

  return { specCount, pendingChanges, missingArtifacts, latestSpecAt };
}

function getCapabilitySpecState(workspace, capabilityName) {
  const cap = getCapabilityByName(workspace, capabilityName);
  const signals = getCapabilitySignals(workspace, capabilityName);

  if (!cap?.currentSpecRelativePath) {
    return { label: "缺 current", tone: "warn", signals };
  }
  if (signals.specCount <= 1) {
    return { label: "单 spec", tone: "muted", signals };
  }
  if (signals.pendingChanges > 0 || signals.missingArtifacts > 0) {
    return { label: "多 spec 待收敛", tone: "warn", signals };
  }
  return { label: "多 spec", tone: "info", signals };
}

function fuzzyMatch(source, query) {
  if (!query) return true;
  const haystack = String(source || "").toLowerCase();
  const needle = String(query || "").toLowerCase();
  if (haystack.includes(needle)) return true;

  let cursor = 0;
  for (const ch of needle) {
    cursor = haystack.indexOf(ch, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

function workspaceDisplayText(ws) {
  if (!ws) return "";
  return `${ws.label}（${ws.status === "ok" ? "可读" : "异常"}）`;
}

function resolveWorkspaceIdFromInput(rawInput, list) {
  const input = String(rawInput || "").trim().toLowerCase();
  if (!input) return null;

  const exact = list.find(
    (ws) => ws.id.toLowerCase() === input || ws.label.toLowerCase() === input || ws.path.toLowerCase() === input
  );
  if (exact) return exact.id;

  const partial = list.find((ws) => fuzzyMatch(`${ws.label} ${ws.path} ${ws.id}`, input));
  return partial?.id || null;
}

function applyWorkspaceSelectionById(workspaceId) {
  if (!workspaceId) return;
  if (workspaceId !== state.selectedWorkspaceId) {
    state.selectedWorkspaceId = workspaceId;
    state.selectedChangeId = null;
    state.selectedCapabilityName = null;
    state.selectedArtifactPath = null;
    state.compareLeftPath = null;
    state.compareRightPath = null;
    state.readerFocus = "change";
  }
  state.workspaceQuery = "";
  state.workspaceDropdownOpen = false;
  state.capabilityLensQuery = "";
  rerender();
}

function renderCapabilityRow({
  capabilityName,
  workspaceId,
  relatedCount = 0,
  latest = null,
  workspaceLabel = "",
  extraMeta = "",
  stateLabel = "",
  stateTone = "muted",
  active = false,
  compact = false,
}) {
  const rowClass = ["cap-row"];
  if (compact) rowClass.push("compact");
  if (active) rowClass.push("active");

  const metaParts = [`关联变更 ${relatedCount}`];
  if (workspaceLabel) metaParts.push(workspaceLabel);
  if (extraMeta) metaParts.push(extraMeta);

  return `<button class="${rowClass.join(" ")}" data-capability-name="${capabilityToken(capabilityName)}" data-workspace-id="${workspaceId}">
    <span class="cap-main-wrap">
      <span class="cap-main">${escapeHtml(capabilityName)}</span>
      ${stateLabel ? `<span class="cap-state ${stateTone}">${escapeHtml(stateLabel)}</span>` : ""}
    </span>
    <span class="cap-time">${formatTs(latest)}</span>
    <span class="cap-meta">${escapeHtml(metaParts.join(" · "))}</span>
  </button>`;
}

function mapSyncSummary(summary) {
  if (!summary) return "无增量变化";
  return `工作区 ${summary.workspaceCount || 0} · 新增变更 ${summary.changeAdded || 0} · 变更更新 ${summary.changeUpdated || 0} · 新增能力 ${summary.capabilityAdded || 0} · 能力更新 ${summary.capabilityUpdated || 0}`;
}

function renderMetaBadge(label, value, tone = "neutral") {
  return `<span class="meta-badge ${tone}">
    <span class="meta-badge-label">${escapeHtml(label)}</span>
    <span class="meta-badge-value">${escapeHtml(value)}</span>
  </span>`;
}

function describeFreshness(ts) {
  if (!ts) return { text: "未索引", tone: "muted" };
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return { text: "时间异常", tone: "warn" };

  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return { text: "刚刚", tone: "success" };

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 15) return { text: `${diffMin} 分钟前`, tone: "success" };
  if (diffMin < 60) return { text: `${diffMin} 分钟前`, tone: "info" };

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return { text: `${diffHour} 小时前`, tone: "warn" };

  const diffDay = Math.floor(diffHour / 24);
  return { text: `${diffDay} 天前`, tone: "warn" };
}

function renderSyncInsight(summary) {
  if (!summary) return "";
  return `<div class="index-hint">最近同步：新增变更 ${summary.changeAdded || 0} · 变更更新 ${summary.changeUpdated || 0} · 新增能力 ${summary.capabilityAdded || 0}</div>`;
}

function renderSyncState() {
  const sync = state.sync || { status: "idle", message: "等待同步操作", summary: null };
  const statusToText = {
    idle: "空闲",
    syncing: "同步中",
    success: "成功",
    failed: "失败",
  };

  els.syncStateBadge.className = "sync-badge";
  els.syncStateBadge.classList.add(`state-${sync.status || "idle"}`);
  els.syncStateBadge.textContent = statusToText[sync.status] || "空闲";

  const message = sync.message || "等待同步操作";
  const summary = mapSyncSummary(sync.summary);
  const endedAt = sync.endedAt ? `（${formatTs(sync.endedAt)}）` : "";
  els.syncStateText.textContent = `${message} · ${summary} ${endedAt}`.trim();

  const syncing = sync.status === "syncing";
  els.syncAddBtn.disabled = syncing;
  els.refreshAllBtn.disabled = syncing;
  els.refreshWorkspaceBtn.disabled = syncing || !state.selectedWorkspaceId;
  els.clearWorkspacesBtn.disabled = syncing || (state.index?.workspaces || []).length === 0;
}

function renderWorkspaceBar() {
  const list = state.index?.workspaces || [];
  const query = state.workspaceQuery.trim().toLowerCase();
  const filtered = list.filter((ws) => fuzzyMatch(`${ws.label} ${ws.path} ${ws.id}`, query));

  if (!list.find((ws) => ws.id === state.selectedWorkspaceId)) {
    state.selectedWorkspaceId = list[0]?.id || null;
    state.workspaceQuery = "";
  }

  let dropdownRows = "";
  if (list.length === 0) {
    dropdownRows = '<div class="workspace-option empty">暂无工作区</div>';
  } else if (filtered.length === 0) {
    dropdownRows = '<div class="workspace-option empty">无匹配工作区</div>';
  } else {
    dropdownRows = filtered
      .slice(0, 32)
      .map((ws) => {
        const active = ws.id === state.selectedWorkspaceId ? "active" : "";
        const statusText = ws.status === "ok" ? "可读" : "异常";
        return `<button class="workspace-option ${active}" data-workspace-option-id="${ws.id}" type="button">
          <span class="name">${escapeHtml(ws.label)}</span>
          <span class="meta">${escapeHtml(ws.path)} · ${statusText}</span>
        </button>`;
      })
      .join("");
  }
  els.workspaceDropdown.innerHTML = dropdownRows;
  els.workspaceDropdown.classList.toggle("open", state.workspaceDropdownOpen);

  const selectedWs = getSelectedWorkspace();
  const display = state.workspaceQuery || workspaceDisplayText(selectedWs);
  if (els.workspaceCombo.value !== display) {
    els.workspaceCombo.value = display;
  }

  els.workspaceCombo.disabled = list.length === 0;
  els.workspaceComboToggle.disabled = list.length === 0;
  els.workspaceComboToggle.setAttribute("aria-expanded", state.workspaceDropdownOpen ? "true" : "false");
  els.removeWorkspaceBtn.disabled = !list.find((ws) => ws.id === state.selectedWorkspaceId);
  els.stopServiceBtn.disabled = !state.runtime?.running;

  const totalChanges = list.reduce((sum, ws) => sum + ws.changes.length, 0);
  const totalCaps = list.reduce((sum, ws) => sum + ws.capabilities.length, 0);
  const okWorkspaces = list.filter((ws) => ws.status === "ok").length;
  const brokenWorkspaces = Math.max(0, list.length - okWorkspaces);
  const needsReviewChanges = list.reduce((sum, ws) => sum + ws.reviewQueue.filter((c) => c.needsReview).length, 0);
  const missingArtifacts = list.reduce(
    (sum, ws) => sum + ws.changes.reduce((acc, change) => acc + (change.missingArtifacts?.length || 0), 0),
    0
  );
  if (state.index?.generatedAt) {
    const freshness = describeFreshness(state.index.generatedAt);
    els.scanMeta.innerHTML = `
      <div class="meta-group index-insight">
        <div class="index-head">
          <div class="meta-group-title">索引洞察</div>
          ${renderMetaBadge("新鲜度", freshness.text, freshness.tone)}
        </div>
        <div class="index-primary">
          <span>上次索引</span>
          <strong>${escapeHtml(formatTs(state.index.generatedAt))}</strong>
        </div>
        <div class="meta-badge-grid metrics">
          ${renderMetaBadge("工作区", `${okWorkspaces}/${list.length}`, brokenWorkspaces > 0 ? "warn" : "success")}
          ${renderMetaBadge("变更", String(totalChanges))}
          ${renderMetaBadge("待审", String(needsReviewChanges), needsReviewChanges > 0 ? "warn" : "muted")}
          ${renderMetaBadge("缺件", String(missingArtifacts), missingArtifacts > 0 ? "warn" : "muted")}
          ${renderMetaBadge("能力", String(totalCaps))}
        </div>
        ${renderSyncInsight(state.sync?.summary)}
      </div>
    `;
  } else {
    els.scanMeta.innerHTML = `
      <div class="meta-group index-insight">
        <div class="meta-group-title">索引洞察</div>
        <div class="meta-badge-grid metrics">
          ${renderMetaBadge("索引", "暂无", "muted")}
          ${renderMetaBadge("工作区", String(list.length))}
          ${renderMetaBadge("变更", String(totalChanges))}
          ${renderMetaBadge("能力", String(totalCaps))}
        </div>
      </div>
    `;
  }

  if (!state.runtime?.runtime) {
    els.runtimeMeta.innerHTML = `
      <div class="meta-group">
        <div class="meta-group-title">服务状态</div>
        <div class="meta-badge-grid runtime">
          ${renderMetaBadge("服务", "未运行", "warn")}
        </div>
      </div>
    `;
  } else if (state.runtime.running) {
    els.runtimeMeta.innerHTML = `
      <div class="meta-group">
        <div class="meta-group-title">服务状态</div>
        <div class="meta-badge-grid runtime">
          ${renderMetaBadge("服务", "运行中", "success")}
          ${renderMetaBadge("端口", String(state.runtime.runtime.port))}
          ${renderMetaBadge("PID", String(state.runtime.runtime.pid), "muted")}
        </div>
      </div>
    `;
  } else {
    els.runtimeMeta.innerHTML = `
      <div class="meta-group">
        <div class="meta-group-title">服务状态</div>
        <div class="meta-badge-grid runtime">
          ${renderMetaBadge("服务", "信息失效", "warn")}
          ${renderMetaBadge("PID", String(state.runtime.runtime.pid), "muted")}
        </div>
      </div>
    `;
  }
}

function renderNavigation() {
  const ws = getSelectedWorkspace();
  if (!ws) {
    els.navContent.innerHTML = '<p class="muted">未选择工作区。</p>';
    return;
  }

  const query = state.navQuery.trim().toLowerCase();
  const matches = (value) => !query || String(value || "").toLowerCase().includes(query);

  if (state.navMode === "files") {
    const rows = ws.files
      .filter((file) => matches(file.relativePath))
      .map((file) => {
        const active = state.readerFocus === "file" && file.relativePath === state.selectedArtifactPath ? "active" : "";
        const type = file.relativePath.includes("/changes/") ? "变更工件" : "能力规格";
        const token = encodeURIComponent(file.relativePath);
        return `<button class="file-row ${active}" data-open-file="${token}">
          <span class="truncate">${escapeHtml(file.relativePath)}</span>
          <span class="muted">${type}</span>
        </button>`;
      })
      .join("");

    els.navContent.innerHTML = `
      <h3>文件</h3>
      <div class="file-table">
        <div class="table-head"><span>路径</span><span>类型</span></div>
        ${rows || '<p class="muted">没有匹配文件。</p>'}
      </div>
    `;
    return;
  }

  const queueRows = ws.reviewQueue
    .filter((change) => {
      if (!query) return true;
      if (matches(change.name)) return true;
      if (change.impactedCapabilities?.some((cap) => matches(cap))) return true;
      return change.artifacts.some((artifact) => matches(artifact.relativePath));
    })
    .map((change) => {
      const active = state.readerFocus === "change" && change.id === state.selectedChangeId ? "active" : "";
      const progress = `${change.taskProgress.done}/${change.taskProgress.total}`;
      const status = change.needsReview
        ? '<span class="badge warn">待审阅</span>'
        : '<span class="badge">稳定</span>';
      const missing =
        change.missingArtifacts.length > 0
          ? `<span class="badge error">缺 ${change.missingArtifacts.length}</span>`
          : '<span class="badge">工件完整</span>';

      return `<button class="queue-row ${active}" data-change-id="${change.id}">
        <span class="truncate"><strong>${escapeHtml(change.name)}</strong></span>
        <span class="mono">${progress}</span>
        <span>
          <span class="muted">${formatTs(change.lastModified)}</span>
          <span class="badges">${status}${missing}</span>
        </span>
      </button>`;
    })
    .join("");

  const selectedChange = getSelectedChange(ws);
  const scopedCapabilityNames = (selectedChange?.impactedCapabilities || []).filter((name) =>
    ws.capabilities.some((cap) => cap.name === name)
  );
  const fallbackCapabilityNames = ws.capabilities.map((cap) => cap.name).slice(0, 8);
  const capabilitySource = scopedCapabilityNames.length > 0 ? scopedCapabilityNames : fallbackCapabilityNames;
  const capabilityNames = capabilitySource.filter((name) => matches(name));

  const capCards = capabilityNames
    .map((name) => {
      const cap = getCapabilityByName(ws, name);
      const latest = cap?.relatedChanges?.[0]?.lastModified || null;
      const specState = getCapabilitySpecState(ws, name);
      return renderCapabilityRow({
        capabilityName: name,
        workspaceId: ws.id,
        relatedCount: cap?.relatedChanges?.length || 0,
        latest,
        extraMeta: scopedCapabilityNames.length > 0 ? "当前变更入口" : "工作区入口",
        stateLabel: specState.label,
        stateTone: specState.tone,
        active: state.selectedCapabilityName === name,
        compact: true,
      });
    })
    .join("");

  const multiSpecCount = ws.capabilities.filter((cap) => getCapabilitySpecState(ws, cap.name).label.startsWith("多 spec")).length;
  const convergeCount = ws.capabilities.filter((cap) => getCapabilitySpecState(ws, cap.name).label === "多 spec 待收敛").length;

  els.navContent.innerHTML = `
    <h3>变更队列</h3>
    <div class="queue-table">
      <div class="table-head"><span>变更</span><span>任务</span><span>最近更新</span></div>
      ${queueRows || '<p class="muted">没有匹配变更。</p>'}
    </div>
    <h3>能力入口</h3>
    <div class="cap-entry-head">
      <span class="muted">工作区能力 ${ws.capabilities.length} · 多 spec ${multiSpecCount} · 待收敛 ${convergeCount}</span>
      <button class="cap-jump-btn" data-cap-scope-target="workspace" type="button">在右侧浏览全部</button>
    </div>
    <div class="cap-list">${capCards || '<p class="muted">当前入口无匹配能力。</p>'}</div>
  `;
}

async function renderFileStoryReader(ws) {
  const selectedPath = state.selectedArtifactPath;
  if (!selectedPath) {
    els.readerContent.innerHTML = '<p class="muted">请先在文件列表中选择一个文件。</p>';
    return;
  }

  let content = "";
  try {
    content = await loadFile(ws.id, selectedPath);
  } catch (error) {
    content = `读取失败：${error.message}`;
  }

  const mappedChange = findChangeByArtifactPath(ws, selectedPath);
  const mappedHint = mappedChange ? `所属变更：${escapeHtml(mappedChange.name)}` : "独立规格文件";

  els.readerContent.innerHTML = `
    <div class="card">
      <strong>${escapeHtml(selectedPath)}</strong>
      <div class="muted">${mappedHint}</div>
    </div>
    <div class="preview-pane">${renderMarkdown(content)}</div>
  `;
}

async function renderChangeStoryReader(ws, change) {
  if (!change) {
    els.readerContent.innerHTML = '<p class="muted">请选择一个变更开始阅读。</p>';
    return;
  }

  const artifacts = getChangeArtifacts(change);
  if (artifacts.length === 0) {
    els.readerContent.innerHTML = '<p class="muted">该变更暂无可读工件。</p>';
    return;
  }

  const selected = artifacts.find((item) => item.relativePath === state.selectedArtifactPath) || artifacts[0];
  state.selectedArtifactPath = selected.relativePath;

  const nav = artifacts
    .map((artifact) => {
      const active = artifact.relativePath === selected.relativePath ? "active" : "";
      return `<button class="card link-btn ${active}" data-artifact-path="${artifact.relativePath}">
        <strong>${escapeHtml(artifact.title)}</strong>
        <div class="muted">${escapeHtml(artifact.relativePath)}</div>
      </button>`;
    })
    .join("");

  let content = "";
  try {
    content = await loadFile(ws.id, selected.relativePath);
  } catch (error) {
    content = `读取失败：${error.message}`;
  }

  els.readerContent.innerHTML = `
    <div class="reader-grid">
      <div>${nav}</div>
      <div class="preview-pane">${renderMarkdown(content)}</div>
    </div>
  `;
}

async function renderStoryReader(ws, change) {
  if (state.readerFocus === "file") {
    await renderFileStoryReader(ws);
    return;
  }
  await renderChangeStoryReader(ws, change);
}

async function renderCompareReader(ws, change) {
  if (!change) {
    els.readerContent.innerHTML = '<p class="muted">请选择一个变更进行并排对照。</p>';
    return;
  }

  const artifacts = getChangeArtifacts(change);
  if (artifacts.length === 0) {
    els.readerContent.innerHTML = '<p class="muted">该变更暂无可对照工件。</p>';
    return;
  }

  const defaults = pickDefaultComparePaths(artifacts);
  const leftPath = state.compareLeftPath || defaults.preferredLeft;
  const rightPath = state.compareRightPath || defaults.preferredRight;

  const options = artifacts
    .map((artifact) => `<option value="${artifact.relativePath}">${escapeHtml(artifact.title)}</option>`)
    .join("");

  let left = "";
  let right = "";
  try {
    left = await loadFile(ws.id, leftPath);
  } catch (error) {
    left = `左侧读取失败：${error.message}`;
  }
  try {
    right = await loadFile(ws.id, rightPath);
  } catch (error) {
    right = `右侧读取失败：${error.message}`;
  }

  els.readerContent.innerHTML = `
    <div class="compare-controls">
      <label>左侧</label>
      <select id="leftSelect">${options}</select>
      <label>右侧</label>
      <select id="rightSelect">${options}</select>
      <button id="compareSwapBtn" type="button">互换</button>
    </div>
    <div class="compare-grid">
      <div class="compare-pane">${renderMarkdown(left)}</div>
      <div class="compare-pane">${renderMarkdown(right)}</div>
    </div>
  `;

  document.getElementById("leftSelect").value = leftPath;
  document.getElementById("rightSelect").value = rightPath;
}

function timelineTypeLabel(type) {
  const map = {
    workspace_bound: "绑定工作区",
    workspace_reused: "复用工作区",
    workspace_unbound: "解绑工作区",
    workspace_clear: "清空工作区",
    sync_started: "开始同步",
    sync_completed: "同步完成",
    sync_failed: "同步失败",
    change_added: "新增变更",
    change_updated: "变更更新",
    capability_added: "新增能力",
    capability_updated: "能力更新",
    service_stop_requested: "请求停止服务",
  };
  return map[type] || type;
}

function renderTimelineItems(opts = {}) {
  const capabilityName = opts.capabilityName || null;
  const ws = getSelectedWorkspace();
  const change = getSelectedChange(ws);
  const impacted = new Set(change?.impactedCapabilities || []);

  let items = [...state.timeline];
  if (ws) {
    items = items.filter((event) => !event.workspaceId || event.workspaceId === ws.id);
  }

  if (capabilityName && ws) {
    const changeIds = new Set((getCapabilityByName(ws, capabilityName)?.relatedChanges || []).map((item) => item.changeId));
    items = items.filter(
      (event) => event.capabilityName === capabilityName || (event.changeId && changeIds.has(event.changeId))
    );
    items.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  } else if (change) {
    items.sort((a, b) => {
      const aScore = a.changeId === change.id || impacted.has(a.capabilityName) ? 1 : 0;
      const bScore = b.changeId === change.id || impacted.has(b.capabilityName) ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return (b.ts || "").localeCompare(a.ts || "");
    });
  } else {
    items.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  }

  const rows = items.slice(0, 14).map((event) => {
    const message = event.message ? ` · ${escapeHtml(event.message)}` : "";
    const scope = event.workspaceLabel ? ` · ${escapeHtml(event.workspaceLabel)}` : "";
    return `<div class="timeline-item">
      <div class="title">${timelineTypeLabel(event.type)}</div>
      <div class="meta">${formatTs(event.ts)}${scope}${message}</div>
    </div>`;
  });

  return rows.join("") || '<p class="muted">暂无时间线事件。</p>';
}

function renderCapabilityLens() {
  const ws = getSelectedWorkspace();
  if (!ws) {
    els.lensContent.innerHTML = '<p class="muted">未选择工作区。</p>';
    return;
  }

  const change = getSelectedChange(ws);
  const impactedNames = change?.impactedCapabilities || [];
  const query = state.capabilityLensQuery.trim().toLowerCase();
  let entries = [];
  let scopeHint = "";

  if (state.capabilityScope === "change") {
    entries = impactedNames
      .map((name) => {
        const cap = getCapabilityByName(ws, name);
        const specState = getCapabilitySpecState(ws, name);
        return {
          capabilityName: name,
          workspaceId: ws.id,
          relatedCount: cap?.relatedChanges?.length || 0,
          latest: cap?.relatedChanges?.[0]?.lastModified || null,
          extraMeta: "当前变更",
          stateLabel: specState.label,
          stateTone: specState.tone,
          active: state.selectedCapabilityName === name,
        };
      })
      .filter((item) => fuzzyMatch(`${item.capabilityName} ${item.stateLabel}`, query));
    scopeHint = `当前变更能力 ${impactedNames.length}`;
  } else if (state.capabilityScope === "workspace") {
    entries = ws.capabilities
      .map((cap) => {
        const specState = getCapabilitySpecState(ws, cap.name);
        return {
          capabilityName: cap.name,
          workspaceId: ws.id,
          relatedCount: cap.relatedChanges.length,
          latest: cap.relatedChanges?.[0]?.lastModified || null,
          extraMeta: "当前工作区",
          stateLabel: specState.label,
          stateTone: specState.tone,
          active: state.selectedCapabilityName === cap.name,
        };
      })
      .filter((item) => fuzzyMatch(`${item.capabilityName} ${item.stateLabel}`, query));
    scopeHint = `当前工作区能力 ${ws.capabilities.length}`;
  } else {
    const globalCaps = state.index?.globalCapabilities || [];
    entries = globalCaps
      .map((cap) => {
        const localCap = getCapabilityByName(ws, cap.name);
        const targetWorkspaceId =
          localCap
            ? ws.id
            : cap.workspaces.find((item) => item.workspaceId === ws.id)?.workspaceId || cap.workspaces[0]?.workspaceId || ws.id;
        const localState = getCapabilitySpecState(ws, cap.name);
        return {
          capabilityName: cap.name,
          workspaceId: targetWorkspaceId,
          relatedCount: cap.recentChanges?.length || 0,
          latest: cap.recentChanges?.[0]?.lastModified || null,
          extraMeta: `跨工作区 ${cap.workspaces?.length || 0}`,
          stateLabel: localCap ? localState.label : `覆盖 ${cap.workspaces?.length || 0}`,
          stateTone: localCap ? localState.tone : "info",
          active: targetWorkspaceId === ws.id && state.selectedCapabilityName === cap.name,
        };
      })
      .filter((item) => fuzzyMatch(`${item.capabilityName} ${item.extraMeta}`, query));
    scopeHint = `全局能力 ${globalCaps.length}`;
  }

  const rows = entries
    .map((item) =>
      renderCapabilityRow({
        ...item,
        compact: true,
      })
    )
    .join("");

  const timelineTitle = state.selectedCapabilityName ? `时间线（${escapeHtml(state.selectedCapabilityName)}）` : "时间线";

  els.lensContent.innerHTML = `
    <section class="lens-section">
      <h3>能力浏览器</h3>
      <div class="lens-toolbar">
        <div class="segmented lens-scope-switch">
          <button data-cap-view="change" class="${state.capabilityScope === "change" ? "active" : ""}" type="button">当前变更</button>
          <button data-cap-view="workspace" class="${state.capabilityScope === "workspace" ? "active" : ""}" type="button">当前工作区</button>
          <button data-cap-view="global" class="${state.capabilityScope === "global" ? "active" : ""}" type="button">全局</button>
        </div>
        <input id="capLensSearchInput" value="${escapeHtml(state.capabilityLensQuery)}" placeholder="筛选能力（支持模糊检索）" />
      </div>
      <div class="muted">${escapeHtml(scopeHint)}</div>
      <div class="cap-list">${rows || '<p class="muted">当前视图没有匹配能力。</p>'}</div>
    </section>
    <section class="lens-section">
      <h3>${timelineTitle}</h3>
      <div class="timeline-list">${renderTimelineItems({ capabilityName: state.selectedCapabilityName })}</div>
    </section>
  `;
}

async function renderReader() {
  const ws = getSelectedWorkspace();
  const change = getSelectedChange(ws);
  if (!ws) {
    els.readerContent.innerHTML = '<p class="muted">未选择工作区。</p>';
    return;
  }

  if (state.readerMode === "compare") {
    await renderCompareReader(ws, change);
  } else {
    await renderStoryReader(ws, change);
  }
}

function syncButtonStates() {
  els.modeCardsBtn.classList.toggle("active", state.navMode === "cards");
  els.modeFilesBtn.classList.toggle("active", state.navMode === "files");
  els.viewStoryBtn.classList.toggle("active", state.readerMode === "story");
  els.viewCompareBtn.classList.toggle("active", state.readerMode === "compare");
}

async function rerender() {
  setDefaultSelection();
  renderWorkspaceBar();
  renderSyncState();
  renderNavigation();
  renderCapabilityLens();
  await renderReader();
  bindDynamicEvents();
  syncButtonStates();
}

function jumpToCapability(name) {
  const ws = getSelectedWorkspace();
  if (!ws) return;
  state.selectedCapabilityName = name;

  for (const candidate of ws.changes) {
    const hit = getChangeArtifacts(candidate).find((artifact) => artifact.type === "spec" && artifact.capability === name);
    if (hit) {
      state.selectedChangeId = candidate.id;
      state.selectedArtifactPath = hit.relativePath;
      state.readerMode = "story";
      state.readerFocus = "change";
      rerender();
      return;
    }
  }

  const cap = ws.capabilities.find((item) => item.name === name);
  if (cap?.currentSpecRelativePath) {
    state.selectedArtifactPath = cap.currentSpecRelativePath;
    state.readerMode = "story";
    state.readerFocus = "file";
    rerender();
    return;
  }

  rerender();
}

function bindDynamicEvents() {
  for (const el of document.querySelectorAll("[data-cap-scope-target]")) {
    el.addEventListener("click", () => {
      const target = el.dataset.capScopeTarget;
      if (!target) return;
      state.capabilityScope = target;
      state.capabilityLensQuery = "";
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-cap-view]")) {
    el.addEventListener("click", () => {
      const view = el.dataset.capView;
      if (!view) return;
      state.capabilityScope = view;
      rerender();
    });
  }

  const capLensSearchInput = document.getElementById("capLensSearchInput");
  if (capLensSearchInput) {
    capLensSearchInput.addEventListener("input", () => {
      state.capabilityLensQuery = capLensSearchInput.value;
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-workspace-option-id]")) {
    el.addEventListener("click", () => {
      applyWorkspaceSelectionById(el.dataset.workspaceOptionId || "");
    });
  }

  for (const el of document.querySelectorAll("[data-change-id]")) {
    el.addEventListener("click", () => {
      state.selectedChangeId = el.dataset.changeId;
      state.readerMode = "story";
      state.readerFocus = "change";
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-artifact-path]")) {
    el.addEventListener("click", () => {
      state.selectedArtifactPath = el.dataset.artifactPath;
      state.readerFocus = "change";
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-open-file]")) {
    el.addEventListener("click", () => {
      state.selectedArtifactPath = decodeURIComponent(el.dataset.openFile || "");
      state.readerMode = "story";
      state.readerFocus = "file";
      rerender();
    });
  }

  for (const el of document.querySelectorAll("[data-capability-name]")) {
    el.addEventListener("click", () => {
      const capabilityName = decodeURIComponent(el.dataset.capabilityName || "");
      const workspaceId = el.dataset.workspaceId || state.selectedWorkspaceId;
      if (workspaceId && workspaceId !== state.selectedWorkspaceId) {
        state.selectedWorkspaceId = workspaceId;
        state.workspaceQuery = "";
        state.workspaceDropdownOpen = false;
        state.selectedChangeId = null;
        state.selectedArtifactPath = null;
        state.compareLeftPath = null;
        state.compareRightPath = null;
        state.readerFocus = "change";
      }
      jumpToCapability(capabilityName);
    });
  }

  const leftSelect = document.getElementById("leftSelect");
  const rightSelect = document.getElementById("rightSelect");
  const compareSwapBtn = document.getElementById("compareSwapBtn");
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
  if (compareSwapBtn) {
    compareSwapBtn.addEventListener("click", () => {
      const temp = state.compareLeftPath;
      state.compareLeftPath = state.compareRightPath;
      state.compareRightPath = temp;
      rerender();
    });
  }
}

async function loadDashboard() {
  const [indexData, runtimeData, syncData, timelineData] = await Promise.all([
    api("/api/index"),
    api("/api/runtime/status"),
    api("/api/sync/status"),
    api("/api/timeline?limit=120"),
  ]);
  state.index = indexData;
  state.runtime = runtimeData;
  state.sync = syncData.sync || { status: "idle", message: "等待同步操作" };
  state.timeline = timelineData.events || syncData.recentEvents || [];
  await rerender();
}

async function guarded(action, options = {}) {
  try {
    await action();
  } catch (error) {
    const message = options.messagePrefix ? `${options.messagePrefix}：${error.message}` : error.message;
    els.readerContent.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
    state.sync = {
      status: "failed",
      message,
      summary: null,
    };
    renderSyncState();
  }
}

async function runSync(payload, pendingMessage) {
  state.sync = {
    status: "syncing",
    message: pendingMessage,
    summary: null,
  };
  renderSyncState();

  await api("/api/sync", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
  await loadDashboard();
  if (els.syncPopover?.open) {
    els.syncPopover.open = false;
  }
}

function bindStaticEvents() {
  els.brandLogo.addEventListener("load", () => {
    els.brandLogo.parentElement.classList.add("has-logo");
  });
  els.brandLogo.addEventListener("error", () => {
    els.brandLogo.parentElement.classList.remove("has-logo");
  });

  document.addEventListener("click", (event) => {
    if (!els.syncPopover?.open) return;
    if (els.syncPopover.contains(event.target)) return;
    els.syncPopover.open = false;
  });

  document.addEventListener("click", (event) => {
    if (!els.workspaceMenu?.open) return;
    if (els.workspaceMenu.contains(event.target)) return;
    els.workspaceMenu.open = false;
  });

  document.addEventListener("click", (event) => {
    if (!els.workspaceComboWrap) return;
    if (els.workspaceComboWrap.contains(event.target)) return;
    if (!state.workspaceDropdownOpen && !state.workspaceQuery) return;
    state.workspaceDropdownOpen = false;
    state.workspaceQuery = "";
    rerender();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.syncPopover?.open) {
      els.syncPopover.open = false;
    }
    if (event.key === "Escape" && els.workspaceMenu?.open) {
      els.workspaceMenu.open = false;
    }
    if (event.key === "Escape" && state.workspaceDropdownOpen) {
      state.workspaceDropdownOpen = false;
      state.workspaceQuery = "";
      rerender();
    }
  });

  els.navSearchInput.addEventListener("input", () => {
    state.navQuery = els.navSearchInput.value;
    rerender();
  });

  const applyWorkspaceSelection = () => {
    const list = state.index?.workspaces || [];
    if (list.length === 0) return;
    const resolvedId = resolveWorkspaceIdFromInput(els.workspaceCombo.value, list);
    if (!resolvedId) {
      state.workspaceQuery = els.workspaceCombo.value;
      state.workspaceDropdownOpen = true;
      rerender();
      return;
    }
    applyWorkspaceSelectionById(resolvedId);
  };

  els.workspaceCombo.addEventListener("input", () => {
    state.workspaceQuery = els.workspaceCombo.value;
    state.workspaceDropdownOpen = true;
    rerender();
  });

  els.workspaceCombo.addEventListener("focus", () => {
    if ((state.index?.workspaces || []).length === 0) return;
    state.workspaceDropdownOpen = true;
    rerender();
  });

  els.workspaceCombo.addEventListener("change", applyWorkspaceSelection);

  els.workspaceComboToggle.addEventListener("click", () => {
    if ((state.index?.workspaces || []).length === 0) return;
    state.workspaceDropdownOpen = !state.workspaceDropdownOpen;
    if (state.workspaceDropdownOpen) {
      els.workspaceCombo.focus();
    } else {
      state.workspaceQuery = "";
    }
    rerender();
  });

  els.workspaceCombo.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyWorkspaceSelection();
      return;
    }
    if (event.key === "ArrowDown") {
      state.workspaceDropdownOpen = true;
      rerender();
      return;
    }
    if (event.key === "Escape") {
      state.workspaceDropdownOpen = false;
      state.workspaceQuery = "";
      rerender();
    }
  });

  els.modeCardsBtn.addEventListener("click", () => {
    state.navMode = "cards";
    state.readerFocus = "change";
    rerender();
  });

  els.modeFilesBtn.addEventListener("click", () => {
    state.navMode = "files";
    if (state.readerFocus !== "file") {
      const ws = getSelectedWorkspace();
      if (ws?.files?.length > 0) {
        state.selectedArtifactPath = ws.files[0].relativePath;
      }
    }
    state.readerFocus = "file";
    state.readerMode = "story";
    rerender();
  });

  els.viewStoryBtn.addEventListener("click", () => {
    state.readerMode = "story";
    rerender();
  });

  els.viewCompareBtn.addEventListener("click", () => {
    state.readerMode = "compare";
    state.readerFocus = "change";
    rerender();
  });

  els.syncAddBtn.addEventListener("click", async () => {
    const targetPath = els.addWorkspacePath.value.trim();
    const label = els.addWorkspaceLabel.value.trim();
    if (!targetPath) return;

    await guarded(async () => {
      await runSync({ path: targetPath, label: label || undefined }, "正在添加并同步工作区...");
      els.addWorkspacePath.value = "";
      els.addWorkspaceLabel.value = "";
    }, { messagePrefix: "添加并刷新失败" });
  });

  els.refreshWorkspaceBtn.addEventListener("click", async () => {
    if (!state.selectedWorkspaceId) return;
    await guarded(async () => {
      await runSync({ workspaceId: state.selectedWorkspaceId }, "正在刷新当前工作区...");
    }, { messagePrefix: "刷新当前工作区失败" });
  });

  els.refreshAllBtn.addEventListener("click", async () => {
    await guarded(async () => {
      await runSync({}, "正在刷新全部工作区...");
    }, { messagePrefix: "刷新全部工作区失败" });
  });

  els.removeWorkspaceBtn.addEventListener("click", async () => {
    if (!state.selectedWorkspaceId) return;
    await guarded(async () => {
      await api(`/api/workspaces/${encodeURIComponent(state.selectedWorkspaceId)}`, { method: "DELETE" });
      state.selectedWorkspaceId = null;
      state.workspaceQuery = "";
      state.workspaceDropdownOpen = false;
      state.selectedChangeId = null;
      state.selectedCapabilityName = null;
      state.selectedArtifactPath = null;
      await loadDashboard();
    }, { messagePrefix: "解绑失败" });
  });

  els.clearWorkspacesBtn.addEventListener("click", async () => {
    if (!confirm("确认解绑全部已绑定工作区？")) return;
    await guarded(async () => {
      await api("/api/workspaces", { method: "DELETE" });
      state.selectedWorkspaceId = null;
      state.workspaceQuery = "";
      state.workspaceDropdownOpen = false;
      state.selectedChangeId = null;
      state.selectedCapabilityName = null;
      state.selectedArtifactPath = null;
      await loadDashboard();
      if (els.syncPopover?.open) {
        els.syncPopover.open = false;
      }
    }, { messagePrefix: "清空工作区失败" });
  });

  els.stopServiceBtn.addEventListener("click", async () => {
    if (!confirm("确认停止 spec-readr 服务？")) return;
    await guarded(async () => {
      await api("/api/runtime/stop", { method: "POST", body: JSON.stringify({}) });
      els.runtimeMeta.innerHTML = `
        <div class="meta-group">
          <div class="meta-group-title">服务状态</div>
          <div class="meta-badge-grid runtime">
            ${renderMetaBadge("服务", "正在停止...", "warn")}
          </div>
        </div>
      `;
    }, { messagePrefix: "停止服务失败" });
  });
}

bindStaticEvents();
loadDashboard().catch((error) => {
  els.readerContent.innerHTML = `<p class="muted">加载失败：${escapeHtml(error.message)}</p>`;
});
