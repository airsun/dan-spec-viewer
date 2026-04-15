import fs from "node:fs/promises";
import path from "node:path";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function statSafe(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function readDirSafe(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readDirSafe(current);
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
      } else if (entry.isFile()) {
        out.push(next);
      }
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function parseTaskProgress(content) {
  const lines = content.split(/\r?\n/);
  let total = 0;
  let done = 0;
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s+/);
    if (!m) continue;
    total += 1;
    if (m[1].toLowerCase() === "x") {
      done += 1;
    }
  }
  return {
    total,
    done,
    remaining: Math.max(total - done, 0),
  };
}

function parseCapabilitiesFromSpecPaths(specPaths, prefix) {
  const names = new Set();
  for (const fullPath of specPaths) {
    const rel = fullPath.slice(prefix.length + 1).replace(/\\/g, "/");
    const m = rel.match(/^specs\/([^/]+)\/spec\.md$/);
    if (m) names.add(m[1]);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

async function getLatestMtime(paths) {
  let latest = 0;
  for (const item of paths) {
    const s = await statSafe(item);
    if (s && s.mtimeMs > latest) latest = s.mtimeMs;
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function formatArtifactId(changeName, kind, relativePath) {
  return `${changeName}:${kind}:${relativePath}`;
}

export async function scanWorkspace(workspace) {
  const openspecDir = path.join(workspace.path, "openspec");
  const base = {
    id: workspace.id,
    label: workspace.label,
    path: workspace.path,
    addedAt: workspace.addedAt,
    status: "ok",
    error: null,
    lastScanAt: new Date().toISOString(),
    files: [],
    changes: [],
    capabilities: [],
    reviewQueue: [],
  };

  if (!(await exists(workspace.path))) {
    return {
      ...base,
      status: "error",
      error: "Workspace path does not exist",
    };
  }

  if (!(await exists(openspecDir))) {
    return {
      ...base,
      status: "error",
      error: "Missing openspec directory",
    };
  }

  const allOpenSpecFiles = await walkFiles(openspecDir);
  base.files = allOpenSpecFiles
    .filter((file) => file.endsWith(".md") || file.endsWith(".yaml") || file.endsWith(".yml"))
    .map((file) => ({
      path: file,
      relativePath: path.relative(workspace.path, file).replace(/\\/g, "/"),
      kind: file.endsWith(".md") ? "markdown" : "config",
    }));

  const changesDir = path.join(openspecDir, "changes");
  const changeEntries = await readDirSafe(changesDir);
  const changeDirs = changeEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  for (const changeName of changeDirs.sort((a, b) => a.localeCompare(b))) {
    const changeDir = path.join(changesDir, changeName);
    const proposalPath = path.join(changeDir, "proposal.md");
    const designPath = path.join(changeDir, "design.md");
    const tasksPath = path.join(changeDir, "tasks.md");

    const specFiles = (await walkFiles(path.join(changeDir, "specs"))).filter((file) => file.endsWith("/spec.md"));
    const impactedCapabilities = parseCapabilitiesFromSpecPaths(specFiles, changeDir);

    const taskProgress = parseTaskProgress(await readText(tasksPath));
    const artifactChecks = {
      proposal: await exists(proposalPath),
      design: await exists(designPath),
      tasks: await exists(tasksPath),
      specs: specFiles.length > 0,
    };
    const missingArtifacts = Object.entries(artifactChecks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    const allArtifactPaths = [proposalPath, designPath, tasksPath, ...specFiles].filter(Boolean);
    const lastModified = await getLatestMtime(allArtifactPaths);

    const artifacts = [];
    if (artifactChecks.proposal) {
      artifacts.push({
        id: formatArtifactId(changeName, "proposal", "proposal.md"),
        type: "proposal",
        title: "Proposal",
        path: proposalPath,
        relativePath: path.relative(workspace.path, proposalPath).replace(/\\/g, "/"),
      });
    }
    if (artifactChecks.design) {
      artifacts.push({
        id: formatArtifactId(changeName, "design", "design.md"),
        type: "design",
        title: "Design",
        path: designPath,
        relativePath: path.relative(workspace.path, designPath).replace(/\\/g, "/"),
      });
    }
    if (artifactChecks.tasks) {
      artifacts.push({
        id: formatArtifactId(changeName, "tasks", "tasks.md"),
        type: "tasks",
        title: "Tasks",
        path: tasksPath,
        relativePath: path.relative(workspace.path, tasksPath).replace(/\\/g, "/"),
        taskProgress,
      });
    }
    for (const specPath of specFiles) {
      const capability = specPath.split(path.sep).slice(-2, -1)[0] ?? "unknown";
      artifacts.push({
        id: formatArtifactId(changeName, "spec", path.relative(changeDir, specPath).replace(/\\/g, "/")),
        type: "spec",
        title: `Spec: ${capability}`,
        capability,
        path: specPath,
        relativePath: path.relative(workspace.path, specPath).replace(/\\/g, "/"),
      });
    }

    const needsReview = taskProgress.remaining > 0 || missingArtifacts.length > 0;
    const isActive = taskProgress.total > 0 ? taskProgress.remaining > 0 : missingArtifacts.length > 0;

    base.changes.push({
      id: changeName,
      name: changeName,
      path: changeDir,
      relativePath: path.relative(workspace.path, changeDir).replace(/\\/g, "/"),
      impactedCapabilities,
      artifacts,
      artifactChecks,
      missingArtifacts,
      taskProgress,
      needsReview,
      isActive,
      lastModified,
    });
  }

  const capabilitySpecFiles = (await walkFiles(path.join(openspecDir, "specs"))).filter((file) =>
    file.endsWith("/spec.md")
  );
  const byCapability = new Map();

  for (const file of capabilitySpecFiles) {
    const rel = path.relative(path.join(openspecDir, "specs"), file).replace(/\\/g, "/");
    const name = rel.split("/")[0];
    if (!byCapability.has(name)) {
      byCapability.set(name, {
        name,
        currentSpecPath: file,
        currentSpecRelativePath: path.relative(workspace.path, file).replace(/\\/g, "/"),
        relatedChanges: [],
      });
    }
  }

  for (const change of base.changes) {
    for (const capability of change.impactedCapabilities) {
      if (!byCapability.has(capability)) {
        byCapability.set(capability, {
          name: capability,
          currentSpecPath: null,
          currentSpecRelativePath: null,
          relatedChanges: [],
        });
      }
      byCapability.get(capability).relatedChanges.push({
        changeId: change.id,
        changeName: change.name,
        lastModified: change.lastModified,
      });
    }
  }

  base.capabilities = [...byCapability.values()]
    .map((item) => ({
      ...item,
      relatedChanges: item.relatedChanges.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || "")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  base.reviewQueue = [...base.changes].sort((a, b) => {
    if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (b.lastModified || "").localeCompare(a.lastModified || "");
  });

  return base;
}
