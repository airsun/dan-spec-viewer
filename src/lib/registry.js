import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveDataDir, REGISTRY_FILENAME } from "./constants.js";

function makeWorkspaceId(workspacePath) {
  const hash = crypto.createHash("sha1").update(workspacePath).digest("hex");
  return `ws-${hash.slice(0, 10)}`;
}

async function ensureDataDir(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
}

function registryFilePath(dataDir) {
  return path.join(dataDir, REGISTRY_FILENAME);
}

export async function loadRegistry(opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  await ensureDataDir(dataDir);
  const file = registryFilePath(dataDir);

  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.workspaces)) {
      return { version: 1, workspaces: [], dataDir };
    }
    return { version: parsed.version ?? 1, workspaces: parsed.workspaces, dataDir };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { version: 1, workspaces: [], dataDir };
    }
    throw error;
  }
}

export async function saveRegistry(registry) {
  await ensureDataDir(registry.dataDir);
  const file = registryFilePath(registry.dataDir);
  const payload = {
    version: registry.version ?? 1,
    workspaces: registry.workspaces ?? [],
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
}

export async function addWorkspace(inputPath, opts = {}) {
  const registry = await loadRegistry(opts);
  const absPath = path.resolve(inputPath);
  const existed = registry.workspaces.find((ws) => ws.path === absPath);
  if (existed) {
    return { registry, workspace: existed, created: false };
  }

  const workspace = {
    id: makeWorkspaceId(absPath),
    label: opts.label?.trim() || path.basename(absPath),
    path: absPath,
    addedAt: new Date().toISOString(),
  };

  registry.workspaces.push(workspace);
  await saveRegistry(registry);
  return { registry, workspace, created: true };
}

export async function removeWorkspace(target, opts = {}) {
  const registry = await loadRegistry(opts);
  const before = registry.workspaces.length;
  registry.workspaces = registry.workspaces.filter((ws) => ws.id !== target && ws.path !== path.resolve(target));
  const removed = before !== registry.workspaces.length;
  if (removed) {
    await saveRegistry(registry);
  }
  return { registry, removed };
}

export async function listWorkspaces(opts = {}) {
  const registry = await loadRegistry(opts);
  return registry.workspaces;
}
