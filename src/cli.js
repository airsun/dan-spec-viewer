#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { addWorkspace, listWorkspaces, loadRegistry, removeWorkspace } from "./lib/registry.js";
import { buildIndex, saveIndexCache } from "./lib/indexer.js";
import { createWorkbenchServer } from "./lib/server.js";
import { clearRuntime, isProcessAlive, isServerHealthy, loadRuntime, waitForServer } from "./lib/runtime.js";

const CLI_ENTRY = fileURLToPath(import.meta.url);
const PROGRAM_NAME = "spec-readr";

function printHelp() {
  console.log(`${PROGRAM_NAME}

Usage:
  ${PROGRAM_NAME} up [path] [--label <name>] [--port <number>]
  ${PROGRAM_NAME} web [--port <number>]
  ${PROGRAM_NAME} down
  ${PROGRAM_NAME} link [path] [--label <name>]
  ${PROGRAM_NAME} unlink <id|path>
  ${PROGRAM_NAME} ls
  ${PROGRAM_NAME} refresh [--all|<id>]

Compatibility Commands:
  ${PROGRAM_NAME} workspace add <path> [--label <name>]
  ${PROGRAM_NAME} workspace rm <id|path>
  ${PROGRAM_NAME} workspace ls
  ${PROGRAM_NAME} rescan [--all|<id>]
  ${PROGRAM_NAME} serve [--port <number>]
`);
}

function parseFlag(args, name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

function positionalArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      out.push(token);
      continue;
    }
    if (token === "--all") continue;
    i += 1;
  }
  return out;
}

async function rescanWorkspace(workspaceIdOrNull = null, opts = {}) {
  const registry = await loadRegistry(opts);
  const index = await buildIndex(registry);
  await saveIndexCache(index, { dataDir: registry.dataDir });
  return { registry, index };
}

async function detectRunningServer(preferredPort, opts = {}) {
  const runtime = await loadRuntime(opts);
  if (runtime?.port) {
    const healthy = await isServerHealthy(runtime.port);
    if (healthy && (!runtime.pid || isProcessAlive(runtime.pid))) {
      return { running: true, port: runtime.port, source: "runtime" };
    }
  }

  if (await isServerHealthy(preferredPort)) {
    return { running: true, port: preferredPort, source: "port" };
  }

  return { running: false, port: null, source: null };
}

async function startDetachedServer(port, dataDir) {
  const child = spawn(process.execPath, [CLI_ENTRY, "serve", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SPEC_READR_DATA_DIR: dataDir,
    },
  });
  child.unref();
  const healthy = await waitForServer(port, { timeoutMs: 10000 });
  if (!healthy) {
    throw new Error(`Server did not become healthy on port ${port}`);
  }
}

async function cmdLink(args) {
  const targetPath = positionalArgs(args)[0] ?? process.cwd();
  const label = parseFlag(args, "--label");
  const result = await addWorkspace(targetPath, { label });
  console.log(result.created ? "Workspace linked." : "Workspace already linked.");
  console.log(`${result.workspace.id}\t${result.workspace.label}\t${result.workspace.path}`);
  return result;
}

async function cmdUnlink(args) {
  const target = positionalArgs(args)[0];
  if (!target) {
    console.error("unlink requires <id|path>");
    process.exitCode = 1;
    return;
  }
  const result = await removeWorkspace(target);
  console.log(result.removed ? "Workspace unlinked." : "Workspace not found.");
}

async function cmdList() {
  const rows = await listWorkspaces();
  if (rows.length === 0) {
    console.log("No workspaces linked.");
    return;
  }
  for (const ws of rows) {
    console.log(`${ws.id}\t${ws.label}\t${ws.path}`);
  }
}

async function cmdWorkspace(args) {
  const sub = args[0];
  if (sub === "add") {
    const targetPath = positionalArgs(args.slice(1))[0];
    if (!targetPath) {
      console.error("workspace add requires <path>");
      process.exitCode = 1;
      return;
    }
    await cmdLink(args.slice(1));
    return;
  }

  if (sub === "rm") {
    const target = positionalArgs(args.slice(1))[0];
    if (!target) {
      console.error("workspace rm requires <id|path>");
      process.exitCode = 1;
      return;
    }
    await cmdUnlink(args.slice(1));
    return;
  }

  if (sub === "ls") {
    await cmdList();
    return;
  }

  printHelp();
  process.exitCode = 1;
}

async function cmdRescan(args) {
  const all = args.includes("--all");
  const target = all ? null : positionalArgs(args)[0] ?? null;
  const { index } = await rescanWorkspace(target);

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
  await app.registerShutdownHooks();
  console.log(`Dan Spec Readr running at http://127.0.0.1:${realPort}`);
  console.log("Read-only mode enabled.");
}

async function cmdUp(args) {
  const pathArg = positionalArgs(args)[0] ?? process.cwd();
  const portRaw = parseFlag(args, "--port", "4173");
  const port = Number.parseInt(portRaw, 10);
  const label = parseFlag(args, "--label");

  const linkResult = await addWorkspace(pathArg, { label });
  await rescanWorkspace(linkResult.workspace.id, { dataDir: linkResult.registry.dataDir });

  const targetPort = Number.isFinite(port) ? port : 4173;
  const running = await detectRunningServer(targetPort, { dataDir: linkResult.registry.dataDir });
  let finalPort = running.port;

  if (!running.running) {
    await startDetachedServer(targetPort, linkResult.registry.dataDir);
    finalPort = targetPort;
    console.log(`Started web service on http://127.0.0.1:${finalPort}`);
  } else {
    console.log(`Web service already running on http://127.0.0.1:${finalPort}, skip serve.`);
  }

  console.log(linkResult.created ? "Linked current workspace." : "Current workspace already linked.");
  console.log(`${linkResult.workspace.id}\t${linkResult.workspace.label}\t${linkResult.workspace.path}`);
}

async function cmdDown() {
  const runtime = await loadRuntime();
  if (!runtime) {
    console.log("No runtime found.");
    return;
  }
  if (isProcessAlive(runtime.pid)) {
    try {
      process.kill(runtime.pid, "SIGTERM");
    } catch (error) {
      console.warn(`Failed to signal pid ${runtime.pid}: ${error.message}`);
    }
  }
  await clearRuntime();
  console.log("Web service stop signal sent.");
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }

  if (cmd === "up") {
    await cmdUp(args.slice(1));
    return;
  }

  if (cmd === "down") {
    await cmdDown();
    return;
  }

  if (cmd === "web") {
    await cmdServe(args.slice(1));
    return;
  }

  if (cmd === "link") {
    await cmdLink(args.slice(1));
    return;
  }

  if (cmd === "unlink") {
    await cmdUnlink(args.slice(1));
    return;
  }

  if (cmd === "ls") {
    await cmdList();
    return;
  }

  if (cmd === "refresh") {
    await cmdRescan(args.slice(1));
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
