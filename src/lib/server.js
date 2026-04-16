import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { URL, fileURLToPath } from "node:url";
import { addWorkspace, clearWorkspaces, loadRegistry, removeWorkspace, saveRegistry } from "./registry.js";
import { buildIndex, saveIndexCache, loadIndexCache } from "./indexer.js";
import { appendHistoryEvent, appendHistoryEvents, listHistoryEvents } from "./history.js";
import { clearRuntime, clearRuntimeIfOwned, isProcessAlive, isServerHealthy, loadRuntime, saveRuntime } from "./runtime.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function text(res, status, payload, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getStaticType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  return "text/plain; charset=utf-8";
}

function sanitizeFilePath(workspacePath, relativePath) {
  const target = path.resolve(workspacePath, relativePath);
  if (!target.startsWith(workspacePath + path.sep) && target !== workspacePath) {
    return null;
  }
  return target;
}

function parseLimit(raw, fallback = 80) {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 500);
}

function pickScopedWorkspaces(index, targetWorkspaceId = null) {
  const list = index?.workspaces || [];
  if (!targetWorkspaceId) return list;
  return list.filter((ws) => ws.id === targetWorkspaceId);
}

function hasChangeDiff(prev, next) {
  if (!prev) return true;
  if ((prev.lastModified || "") !== (next.lastModified || "")) return true;
  if ((prev.taskProgress?.done || 0) !== (next.taskProgress?.done || 0)) return true;
  if ((prev.taskProgress?.total || 0) !== (next.taskProgress?.total || 0)) return true;
  if ((prev.missingArtifacts?.length || 0) !== (next.missingArtifacts?.length || 0)) return true;
  return false;
}

function capabilityFreshness(capability) {
  return capability?.relatedChanges?.[0]?.lastModified || null;
}

function hasCapabilityDiff(prev, next) {
  if (!prev) return true;
  if ((prev.currentSpecRelativePath || "") !== (next.currentSpecRelativePath || "")) return true;
  if ((prev.relatedChanges?.length || 0) !== (next.relatedChanges?.length || 0)) return true;
  if ((capabilityFreshness(prev) || "") !== (capabilityFreshness(next) || "")) return true;
  return false;
}

function summarizeIndexDelta(previous, next, targetWorkspaceId = null) {
  const oldWorkspaces = pickScopedWorkspaces(previous, targetWorkspaceId);
  const newWorkspaces = pickScopedWorkspaces(next, targetWorkspaceId);
  const oldMap = new Map(oldWorkspaces.map((ws) => [ws.id, ws]));

  const summary = {
    scope: targetWorkspaceId || "all",
    workspaceCount: newWorkspaces.length,
    changeAdded: 0,
    changeUpdated: 0,
    capabilityAdded: 0,
    capabilityUpdated: 0,
  };

  for (const ws of newWorkspaces) {
    const oldWs = oldMap.get(ws.id);
    const oldChangeMap = new Map((oldWs?.changes || []).map((item) => [item.id, item]));
    for (const change of ws.changes || []) {
      const before = oldChangeMap.get(change.id);
      if (!before) summary.changeAdded += 1;
      else if (hasChangeDiff(before, change)) summary.changeUpdated += 1;
    }

    const oldCapMap = new Map((oldWs?.capabilities || []).map((item) => [item.name, item]));
    for (const cap of ws.capabilities || []) {
      const before = oldCapMap.get(cap.name);
      if (!before) summary.capabilityAdded += 1;
      else if (hasCapabilityDiff(before, cap)) summary.capabilityUpdated += 1;
    }
  }

  return summary;
}

function buildDiffEvents(previous, next, targetWorkspaceId = null) {
  const events = [];
  const oldWorkspaces = pickScopedWorkspaces(previous, targetWorkspaceId);
  const newWorkspaces = pickScopedWorkspaces(next, targetWorkspaceId);
  const oldMap = new Map(oldWorkspaces.map((ws) => [ws.id, ws]));

  for (const ws of newWorkspaces) {
    const oldWs = oldMap.get(ws.id);
    const oldChangeMap = new Map((oldWs?.changes || []).map((item) => [item.id, item]));

    for (const change of ws.changes || []) {
      const before = oldChangeMap.get(change.id);
      if (!before || hasChangeDiff(before, change)) {
        events.push({
          ts: change.lastModified || next.generatedAt,
          type: !before ? "change_added" : "change_updated",
          status: "success",
          workspaceId: ws.id,
          workspaceLabel: ws.label,
          changeId: change.id,
          title: !before ? "新增变更" : "变更更新",
          message: `${change.name}`,
          summary: {
            tasksDone: change.taskProgress?.done || 0,
            tasksTotal: change.taskProgress?.total || 0,
            missingArtifacts: change.missingArtifacts?.length || 0,
          },
        });
      }
    }

    const oldCapMap = new Map((oldWs?.capabilities || []).map((item) => [item.name, item]));
    for (const cap of ws.capabilities || []) {
      const before = oldCapMap.get(cap.name);
      if (!before || hasCapabilityDiff(before, cap)) {
        events.push({
          ts: capabilityFreshness(cap) || next.generatedAt,
          type: !before ? "capability_added" : "capability_updated",
          status: "success",
          workspaceId: ws.id,
          workspaceLabel: ws.label,
          capabilityName: cap.name,
          title: !before ? "新增能力" : "能力更新",
          message: `${cap.name}`,
          summary: {
            relatedChanges: cap.relatedChanges?.length || 0,
            hasCurrentSpec: Boolean(cap.currentSpecRelativePath),
          },
        });
      }
    }
  }

  return events.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
}

export async function createWorkbenchServer(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const dataDir = opts.dataDir;

  let registry = await loadRegistry({ cwd, dataDir });
  let index = (await loadIndexCache({ cwd, dataDir })) ?? (await buildIndex(registry));
  await saveIndexCache(index, { cwd, dataDir: registry.dataDir });

  let syncState = {
    status: "idle",
    action: null,
    scope: "all",
    startedAt: null,
    endedAt: null,
    summary: null,
    message: "等待同步",
  };

  async function refreshIndex(targetWorkspaceId = null, meta = {}) {
    const startedAt = new Date().toISOString();
    syncState = {
      status: "syncing",
      action: meta.action || "refresh",
      scope: targetWorkspaceId || "all",
      startedAt,
      endedAt: null,
      summary: null,
      message: "正在同步...",
    };

    await appendHistoryEvent(
      {
        ts: startedAt,
        type: "sync_started",
        status: "info",
        workspaceId: targetWorkspaceId,
        title: "开始同步",
        message: targetWorkspaceId ? `同步工作区 ${targetWorkspaceId}` : "同步全部工作区",
        meta,
      },
      { dataDir: registry.dataDir }
    );

    try {
      registry = await loadRegistry({ cwd, dataDir: registry.dataDir });
      const previous = index;
      const targetIds = targetWorkspaceId ? [targetWorkspaceId] : null;
      const next = await buildIndex(registry, { targetWorkspaceIds: targetIds });

      if (targetWorkspaceId) {
        const preserved = (index.workspaces || []).filter((ws) => ws.id !== targetWorkspaceId);
        next.workspaces = [...preserved, ...next.workspaces].sort((a, b) => a.label.localeCompare(b.label));
        next.globalCapabilities = (await buildIndex(registry)).globalCapabilities;
      }

      index = next;
      await saveIndexCache(index, { cwd, dataDir: registry.dataDir });

      const summary = summarizeIndexDelta(previous, index, targetWorkspaceId);
      const diffEvents = buildDiffEvents(previous, index, targetWorkspaceId);
      const endedAt = new Date().toISOString();

      await appendHistoryEvents(
        [
          ...diffEvents,
          {
            ts: endedAt,
            type: "sync_completed",
            status: "success",
            workspaceId: targetWorkspaceId,
            title: "同步完成",
            message: "索引已更新",
            summary,
            meta,
          },
        ],
        { dataDir: registry.dataDir }
      );

      syncState = {
        status: "success",
        action: meta.action || "refresh",
        scope: targetWorkspaceId || "all",
        startedAt,
        endedAt,
        summary,
        message: "同步成功",
      };

      return { index, summary };
    } catch (error) {
      const endedAt = new Date().toISOString();
      syncState = {
        status: "failed",
        action: meta.action || "refresh",
        scope: targetWorkspaceId || "all",
        startedAt,
        endedAt,
        summary: null,
        message: error.message || "同步失败",
      };

      await appendHistoryEvent(
        {
          ts: endedAt,
          type: "sync_failed",
          status: "failed",
          workspaceId: targetWorkspaceId,
          title: "同步失败",
          message: error.message || "同步失败",
          meta,
        },
        { dataDir: registry.dataDir }
      );
      throw error;
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

      if (req.method === "GET" && url.pathname === "/api/index") {
        return json(res, 200, {
          generatedAt: index.generatedAt,
          workspaceCount: index.workspaces.length,
          globalCapabilityCount: index.globalCapabilities.length,
          workspaces: index.workspaces,
          globalCapabilities: index.globalCapabilities,
        });
      }

      if (req.method === "GET" && url.pathname === "/api/sync/status") {
        const recentEvents = await listHistoryEvents({
          dataDir: registry.dataDir,
          limit: parseLimit(url.searchParams.get("limit"), 30),
        });
        return json(res, 200, {
          sync: syncState,
          recentEvents,
        });
      }

      if (req.method === "GET" && url.pathname === "/api/timeline") {
        const events = await listHistoryEvents({
          dataDir: registry.dataDir,
          limit: parseLimit(url.searchParams.get("limit"), 100),
          workspaceId: url.searchParams.get("workspaceId") || undefined,
          changeId: url.searchParams.get("changeId") || undefined,
          capabilityName: url.searchParams.get("capabilityName") || undefined,
          type: url.searchParams.get("type") || undefined,
        });
        return json(res, 200, { events });
      }

      if (req.method === "POST" && url.pathname === "/api/sync") {
        const body = await readJsonBody(req);
        const targetPath = typeof body.path === "string" ? body.path.trim() : "";

        if (targetPath) {
          const result = await addWorkspace(targetPath, {
            cwd,
            dataDir: registry.dataDir,
            label: body.label,
          });
          registry = result.registry;

          await appendHistoryEvent(
            {
              type: result.created ? "workspace_bound" : "workspace_reused",
              status: "success",
              workspaceId: result.workspace.id,
              workspaceLabel: result.workspace.label,
              title: result.created ? "绑定工作区" : "复用已绑定工作区",
              message: result.workspace.path,
            },
            { dataDir: registry.dataDir }
          );

          const synced = await refreshIndex(result.workspace.id, {
            source: "sync_center",
            action: "bind_refresh",
          });

          return json(res, 200, {
            ok: true,
            created: result.created,
            workspace: result.workspace,
            summary: synced.summary,
            sync: syncState,
          });
        }

        const targetWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
        const synced = await refreshIndex(targetWorkspaceId, {
          source: "sync_center",
          action: targetWorkspaceId ? "refresh_workspace" : "refresh_all",
        });
        return json(res, 200, {
          ok: true,
          summary: synced.summary,
          sync: syncState,
        });
      }

      if (req.method === "GET" && url.pathname === "/api/workspaces") {
        return json(
          res,
          200,
          (registry.workspaces || []).map((ws) => {
            const scanned = (index.workspaces || []).find((x) => x.id === ws.id);
            return {
              ...ws,
              status: scanned?.status ?? "unknown",
              error: scanned?.error ?? null,
              lastScanAt: scanned?.lastScanAt ?? null,
            };
          })
        );
      }

      if (req.method === "DELETE" && url.pathname === "/api/workspaces") {
        const result = await clearWorkspaces({ cwd, dataDir: registry.dataDir });
        registry = result.registry;
        index = await buildIndex(registry);
        await saveIndexCache(index, { cwd, dataDir: registry.dataDir });

        await appendHistoryEvent(
          {
            type: "workspace_clear",
            status: "success",
            title: "清空工作区",
            message: `移除 ${result.removedCount} 个工作区`,
            summary: { removedCount: result.removedCount },
          },
          { dataDir: registry.dataDir }
        );

        return json(res, 200, { removedCount: result.removedCount });
      }

      if (req.method === "POST" && url.pathname === "/api/workspaces") {
        const body = await readJsonBody(req);
        if (!body.path || typeof body.path !== "string") {
          return json(res, 400, { error: "path is required" });
        }

        const result = await addWorkspace(body.path, {
          cwd,
          dataDir: registry.dataDir,
          label: body.label,
        });
        registry = result.registry;

        await appendHistoryEvent(
          {
            type: result.created ? "workspace_bound" : "workspace_reused",
            status: "success",
            workspaceId: result.workspace.id,
            workspaceLabel: result.workspace.label,
            title: result.created ? "绑定工作区" : "复用已绑定工作区",
            message: result.workspace.path,
          },
          { dataDir: registry.dataDir }
        );

        const synced = await refreshIndex(result.workspace.id, {
          source: "legacy_workspaces_api",
          action: "bind_refresh",
        });

        return json(res, 200, {
          created: result.created,
          workspace: result.workspace,
          summary: synced.summary,
        });
      }

      if (req.method === "DELETE" && url.pathname.startsWith("/api/workspaces/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/workspaces/".length));
        const result = await removeWorkspace(id, { cwd, dataDir: registry.dataDir });
        registry = result.registry;
        if (result.removed) {
          index = await buildIndex(registry);
          await saveIndexCache(index, { cwd, dataDir: registry.dataDir });

          await appendHistoryEvent(
            {
              type: "workspace_unbound",
              status: "success",
              workspaceId: id,
              title: "解绑工作区",
              message: id,
            },
            { dataDir: registry.dataDir }
          );
        }
        return json(res, 200, { removed: result.removed });
      }

      if (req.method === "POST" && url.pathname === "/api/workspaces/refresh") {
        const body = await readJsonBody(req);
        const synced = await refreshIndex(body.workspaceId || null, {
          source: "legacy_refresh_api",
          action: body.workspaceId ? "refresh_workspace" : "refresh_all",
        });
        return json(res, 200, {
          ok: true,
          generatedAt: index.generatedAt,
          summary: synced.summary,
        });
      }

      if (req.method === "GET" && url.pathname === "/api/runtime/status") {
        const runtime = await loadRuntime({ dataDir: registry.dataDir });
        if (!runtime) {
          return json(res, 200, { running: false, runtime: null });
        }
        const running = isProcessAlive(runtime.pid) && (await isServerHealthy(runtime.port));
        return json(res, 200, {
          running,
          runtime,
        });
      }

      if (req.method === "POST" && url.pathname === "/api/runtime/stop") {
        const runtime = await loadRuntime({ dataDir: registry.dataDir });
        if (!runtime) {
          return json(res, 200, { stopped: false, reason: "no_runtime" });
        }

        await appendHistoryEvent(
          {
            type: "service_stop_requested",
            status: "info",
            title: "请求停止服务",
            message: `pid ${runtime.pid}`,
          },
          { dataDir: registry.dataDir }
        );

        if (runtime.pid === process.pid) {
          json(res, 200, { stopped: true, self: true, pid: runtime.pid });
          setTimeout(() => {
            process.kill(process.pid, "SIGTERM");
          }, 120);
          return;
        }

        try {
          process.kill(runtime.pid, "SIGTERM");
        } catch {
          // Ignore if process already gone.
        }
        await clearRuntime({ dataDir: registry.dataDir });
        return json(res, 200, { stopped: true, self: false, pid: runtime.pid });
      }

      if (req.method === "GET" && url.pathname === "/api/file") {
        const workspaceId = url.searchParams.get("workspaceId");
        const relativePath = url.searchParams.get("path");
        if (!workspaceId || !relativePath) {
          return json(res, 400, { error: "workspaceId and path are required" });
        }
        const ws = (registry.workspaces || []).find((x) => x.id === workspaceId);
        if (!ws) {
          return json(res, 404, { error: "workspace not found" });
        }
        const target = sanitizeFilePath(ws.path, relativePath);
        if (!target) {
          return json(res, 400, { error: "invalid path" });
        }
        try {
          const content = await fs.readFile(target, "utf8");
          return json(res, 200, {
            workspaceId,
            path: relativePath,
            content,
            readOnly: true,
          });
        } catch {
          return json(res, 404, { error: "file not found" });
        }
      }

      const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const staticPath = path.join(PUBLIC_DIR, reqPath);
      if (!staticPath.startsWith(PUBLIC_DIR)) {
        return text(res, 403, "Forbidden");
      }

      try {
        const content = await fs.readFile(staticPath);
        res.writeHead(200, {
          "Content-Type": getStaticType(staticPath),
          "Content-Length": content.length,
          "Cache-Control": "no-store",
        });
        res.end(content);
      } catch {
        text(res, 404, "Not found");
      }
    } catch (error) {
      json(res, 500, { error: error.message || "internal error" });
    }
  });

  return {
    server,
    async listen(port = 4173) {
      await new Promise((resolve) => server.listen(port, resolve));
      const addr = server.address();
      const realPort = typeof addr === "object" && addr ? addr.port : port;
      await saveRuntime(
        {
          pid: process.pid,
          port: realPort,
          startedAt: new Date().toISOString(),
        },
        { dataDir: registry.dataDir }
      );
      return realPort;
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    getIndex() {
      return index;
    },
    getRegistry() {
      return registry;
    },
    getSyncState() {
      return syncState;
    },
    async refreshIndex(workspaceId = null) {
      return refreshIndex(workspaceId, { source: "server_handle", action: "refresh" });
    },
    async saveRegistry() {
      await saveRegistry(registry);
    },
    async registerShutdownHooks() {
      const shutdown = async (code = 0) => {
        try {
          await clearRuntimeIfOwned(process.pid, { dataDir: registry.dataDir });
          await new Promise((resolve) => {
            server.close(() => resolve());
          });
        } finally {
          process.exit(code);
        }
      };
      process.once("SIGINT", () => {
        shutdown(0);
      });
      process.once("SIGTERM", () => {
        shutdown(0);
      });
    },
  };
}
