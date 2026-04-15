import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDir, RUNTIME_FILENAME } from "./constants.js";

function runtimePath(dataDir) {
  return path.join(dataDir, RUNTIME_FILENAME);
}

export async function loadRuntime(opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  const file = runtimePath(dataDir);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveRuntime(runtime, opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  await fs.mkdir(dataDir, { recursive: true });
  const file = runtimePath(dataDir);
  await fs.writeFile(file, JSON.stringify(runtime, null, 2), "utf8");
}

export async function clearRuntime(opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  const file = runtimePath(dataDir);
  await fs.rm(file, { force: true });
}

export async function clearRuntimeIfOwned(pid, opts = {}) {
  const runtime = await loadRuntime(opts);
  if (!runtime || runtime.pid !== pid) return;
  await clearRuntime(opts);
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    return false;
  }
}

export async function isServerHealthy(port, timeoutMs = 800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/index`, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForServer(port, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const intervalMs = opts.intervalMs ?? 200;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    if (await isServerHealthy(port, intervalMs)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
