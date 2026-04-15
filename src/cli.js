#!/usr/bin/env node
import { addWorkspace, listWorkspaces, loadRegistry, removeWorkspace } from "./lib/registry.js";
import { buildIndex, saveIndexCache } from "./lib/indexer.js";
import { createWorkbenchServer } from "./lib/server.js";

function printHelp() {
  console.log(`dan-spec-readr\n\nUsage:\n  readr workspace add <path> [--label <name>]\n  readr workspace rm <id|path>\n  readr workspace ls\n  readr rescan [--all|<id>]\n  readr serve [--port <number>]\n`);
}

function parseFlag(args, name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

async function cmdWorkspace(args) {
  const sub = args[0];
  if (sub === "add") {
    const targetPath = args[1];
    if (!targetPath) {
      console.error("workspace add requires <path>");
      process.exitCode = 1;
      return;
    }
    const label = parseFlag(args, "--label");
    const result = await addWorkspace(targetPath, { label });
    console.log(result.created ? "Workspace added." : "Workspace already exists.");
    console.log(`${result.workspace.id}\t${result.workspace.label}\t${result.workspace.path}`);
    return;
  }

  if (sub === "rm") {
    const target = args[1];
    if (!target) {
      console.error("workspace rm requires <id|path>");
      process.exitCode = 1;
      return;
    }
    const result = await removeWorkspace(target);
    console.log(result.removed ? "Workspace removed." : "Workspace not found.");
    return;
  }

  if (sub === "ls") {
    const rows = await listWorkspaces();
    if (rows.length === 0) {
      console.log("No workspaces bound.");
      return;
    }
    for (const ws of rows) {
      console.log(`${ws.id}\t${ws.label}\t${ws.path}`);
    }
    return;
  }

  printHelp();
  process.exitCode = 1;
}

async function cmdRescan(args) {
  const registry = await loadRegistry();
  const all = args.includes("--all");
  const target = all ? null : args[0] && !args[0].startsWith("--") ? args[0] : null;
  const targetIds = target ? [target] : null;

  const index = await buildIndex(registry, { targetWorkspaceIds: targetIds });
  await saveIndexCache(index, { dataDir: registry.dataDir });

  if (target) {
    console.log(`Rescanned workspace: ${target}`);
  } else {
    console.log(`Rescanned all workspaces (${index.workspaces.length}).`);
  }
  for (const ws of index.workspaces) {
    console.log(`- ${ws.label} [${ws.status}] changes=${ws.changes.length} capabilities=${ws.capabilities.length}`);
  }
}

async function cmdServe(args) {
  const portRaw = parseFlag(args, "--port", "4173");
  const port = Number.parseInt(portRaw, 10);
  const app = await createWorkbenchServer();
  const realPort = await app.listen(Number.isFinite(port) ? port : 4173);
  console.log(`Dan Spec Readr running at http://127.0.0.1:${realPort}`);
  console.log("Read-only mode enabled.");
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }

  if (cmd === "workspace") {
    await cmdWorkspace(args.slice(1));
    return;
  }

  if (cmd === "rescan") {
    await cmdRescan(args.slice(1));
    return;
  }

  if (cmd === "serve") {
    await cmdServe(args.slice(1));
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
