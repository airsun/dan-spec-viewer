import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_FILENAME, resolveDataDir } from "./constants.js";
import { scanWorkspace } from "./scanner.js";

function cacheFilePath(dataDir) {
  return path.join(dataDir, CACHE_FILENAME);
}

export async function buildIndex(registry, opts = {}) {
  const targetIds = opts.targetWorkspaceIds ? new Set(opts.targetWorkspaceIds) : null;
  const workspaces = [];

  for (const workspace of registry.workspaces ?? []) {
    if (targetIds && !targetIds.has(workspace.id)) continue;
    workspaces.push(await scanWorkspace(workspace));
  }

  const globalMap = new Map();
  for (const ws of workspaces) {
    for (const capability of ws.capabilities) {
      if (!globalMap.has(capability.name)) {
        globalMap.set(capability.name, {
          name: capability.name,
          workspaces: [],
          recentChanges: [],
        });
      }
      const row = globalMap.get(capability.name);
      row.workspaces.push({
        workspaceId: ws.id,
        workspaceLabel: ws.label,
        workspacePath: ws.path,
        hasCurrentSpec: Boolean(capability.currentSpecPath),
      });
      for (const ch of capability.relatedChanges) {
        row.recentChanges.push({
          ...ch,
          workspaceId: ws.id,
          workspaceLabel: ws.label,
        });
      }
    }
  }

  const globalCapabilities = [...globalMap.values()]
    .map((item) => ({
      ...item,
      recentChanges: item.recentChanges.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || "")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    workspaces,
    globalCapabilities,
  };
}

export async function saveIndexCache(index, opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(cacheFilePath(dataDir), JSON.stringify(index, null, 2), "utf8");
}

export async function loadIndexCache(opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  const file = cacheFilePath(dataDir);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
