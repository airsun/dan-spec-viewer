import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { URL, fileURLToPath } from "node:url";
import { addWorkspace, loadRegistry, removeWorkspace, saveRegistry } from "./registry.js";
import { buildIndex, saveIndexCache, loadIndexCache } from "./indexer.js";

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
  return "text/plain; charset=utf-8";
}

function sanitizeFilePath(workspacePath, relativePath) {
  const target = path.resolve(workspacePath, relativePath);
  if (!target.startsWith(workspacePath + path.sep) && target !== workspacePath) {
    return null;
  }
  return target;
}

export async function createWorkbenchServer(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const dataDir = opts.dataDir;

  let registry = await loadRegistry({ cwd, dataDir });
  let index = (await loadIndexCache({ cwd, dataDir })) ?? (await buildIndex(registry));
  await saveIndexCache(index, { cwd, dataDir: registry.dataDir });

  async function refreshIndex(targetWorkspaceId = null) {
    registry = await loadRegistry({ cwd, dataDir: registry.dataDir });
    const targetIds = targetWorkspaceId ? [targetWorkspaceId] : null;
    const next = await buildIndex(registry, { targetWorkspaceIds: targetIds });

    if (targetWorkspaceId) {
      const preserved = (index.workspaces || []).filter((ws) => ws.id !== targetWorkspaceId);
      next.workspaces = [...preserved, ...next.workspaces].sort((a, b) => a.label.localeCompare(b.label));
      next.globalCapabilities = (await buildIndex(registry)).globalCapabilities;
    }

    index = next;
    await saveIndexCache(index, { cwd, dataDir: registry.dataDir });
    return index;
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
        await refreshIndex(result.workspace.id);
        return json(res, 200, {
          created: result.created,
          workspace: result.workspace,
        });
      }

      if (req.method === "DELETE" && url.pathname.startsWith("/api/workspaces/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/workspaces/".length));
        const result = await removeWorkspace(id, { cwd, dataDir: registry.dataDir });
        registry = result.registry;
        if (result.removed) {
          index = await buildIndex(registry);
          await saveIndexCache(index, { cwd, dataDir: registry.dataDir });
        }
        return json(res, 200, { removed: result.removed });
      }

      if (req.method === "POST" && url.pathname === "/api/workspaces/refresh") {
        const body = await readJsonBody(req);
        await refreshIndex(body.workspaceId || null);
        return json(res, 200, {
          ok: true,
          generatedAt: index.generatedAt,
        });
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
      return typeof addr === "object" && addr ? addr.port : port;
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
    async refreshIndex(workspaceId = null) {
      return refreshIndex(workspaceId);
    },
    async saveRegistry() {
      await saveRegistry(registry);
    },
  };
}
