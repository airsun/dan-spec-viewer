import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { HISTORY_FILENAME, resolveDataDir } from "./constants.js";

function historyFilePath(dataDir) {
  return path.join(dataDir, HISTORY_FILENAME);
}

function normalizeEvent(event) {
  return {
    id: event.id || `evt-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    ts: event.ts || new Date().toISOString(),
    type: event.type || "unknown",
    status: event.status || null,
    workspaceId: event.workspaceId || null,
    workspaceLabel: event.workspaceLabel || null,
    changeId: event.changeId || null,
    capabilityName: event.capabilityName || null,
    title: event.title || null,
    message: event.message || null,
    summary: event.summary || null,
    meta: event.meta || null,
  };
}

export async function loadHistory(opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  const file = historyFilePath(dataDir);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveHistory(events, opts = {}) {
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  await fs.mkdir(dataDir, { recursive: true });
  const file = historyFilePath(dataDir);
  await fs.writeFile(file, JSON.stringify(events, null, 2), "utf8");
}

export async function appendHistoryEvent(event, opts = {}) {
  const maxEntries = Number.isFinite(opts.maxEntries) ? opts.maxEntries : 800;
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  const events = await loadHistory({ dataDir });
  events.push(normalizeEvent(event));
  const trimmed = events.slice(-maxEntries);
  await saveHistory(trimmed, { dataDir });
  return trimmed[trimmed.length - 1];
}

export async function appendHistoryEvents(items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const maxEntries = Number.isFinite(opts.maxEntries) ? opts.maxEntries : 800;
  const dataDir = opts.dataDir ?? resolveDataDir(opts.cwd);
  const events = await loadHistory({ dataDir });
  const appended = items.map((item) => normalizeEvent(item));
  events.push(...appended);
  const trimmed = events.slice(-maxEntries);
  await saveHistory(trimmed, { dataDir });
  return appended;
}

export async function listHistoryEvents(opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : 80;
  const events = await loadHistory(opts);
  const filtered = events.filter((event) => {
    if (opts.workspaceId && event.workspaceId !== opts.workspaceId) return false;
    if (opts.changeId && event.changeId !== opts.changeId) return false;
    if (opts.capabilityName && event.capabilityName !== opts.capabilityName) return false;
    if (opts.type && event.type !== opts.type) return false;
    return true;
  });

  return filtered
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
    .slice(0, Math.max(1, limit));
}
