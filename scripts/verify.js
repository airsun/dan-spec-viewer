import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { addWorkspace, loadRegistry } from "../src/lib/registry.js";
import { buildIndex } from "../src/lib/indexer.js";
import { createWorkbenchServer } from "../src/lib/server.js";

async function main() {
  const cwd = process.cwd();
  const dataDir = path.join(cwd, ".tmp-verify-data");
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });

  const wsA = path.join(cwd, "fixtures/ws-a");
  const wsB = path.join(cwd, "fixtures/ws-b");

  await addWorkspace(wsA, { dataDir, label: "workspace-a" });
  await addWorkspace(wsB, { dataDir, label: "workspace-b" });

  const registry = await loadRegistry({ dataDir });
  assert.equal(registry.workspaces.length, 2, "should bind two workspaces");

  const index = await buildIndex(registry);
  assert.equal(index.workspaces.length, 2, "index should include two workspaces");
  const a = index.workspaces.find((ws) => ws.label === "workspace-a");
  assert.ok(a, "workspace-a must exist");
  assert.equal(a.reviewQueue[0].needsReview, true, "workspace-a change should need review");

  const app = await createWorkbenchServer({ cwd, dataDir });
  const port = await app.listen(0);

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    assert.equal(response.ok, true, `request failed: ${url}`);
    return response.json();
  };

  const base = `http://127.0.0.1:${port}`;
  const apiIndex = await fetchJson(`${base}/api/index`);
  assert.equal(apiIndex.workspaces.length, 2, "api index should return two workspaces");
  const runtimeStatus = await fetchJson(`${base}/api/runtime/status`);
  assert.equal(runtimeStatus.running, true, "runtime status should report running");

  const wsAApi = apiIndex.workspaces.find((ws) => ws.label === "workspace-a");
  const filePath = wsAApi.reviewQueue[0].artifacts[0].relativePath;

  const fileResp = await fetchJson(
    `${base}/api/file?workspaceId=${encodeURIComponent(wsAApi.id)}&path=${encodeURIComponent(filePath)}`
  );
  assert.equal(fileResp.readOnly, true, "file endpoint must be read-only");
  assert.ok(fileResp.content.includes("##"), "file content should be returned");

  const refreshed = await fetchJson(`${base}/api/workspaces/refresh`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: wsAApi.id }),
  });
  assert.equal(refreshed.ok, true, "refresh endpoint should succeed");

  const syncResp = await fetchJson(`${base}/api/sync`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: wsAApi.id }),
  });
  assert.equal(syncResp.ok, true, "sync endpoint should succeed");
  assert.ok(syncResp.summary, "sync endpoint should return summary");

  const syncStatus = await fetchJson(`${base}/api/sync/status`);
  assert.equal(syncStatus.sync.status, "success", "sync status should become success");
  assert.ok(Array.isArray(syncStatus.recentEvents), "sync status should return recent events");

  const timeline = await fetchJson(`${base}/api/timeline?limit=20`);
  assert.ok(Array.isArray(timeline.events), "timeline endpoint should return event list");
  assert.ok(timeline.events.length > 0, "timeline should include at least one event after sync");

  const removeResp = await fetchJson(`${base}/api/workspaces/${encodeURIComponent(wsAApi.id)}`, {
    method: "DELETE",
  });
  assert.equal(removeResp.removed, true, "workspace should be removable from web api");

  const afterDelete = await fetchJson(`${base}/api/index`);
  assert.equal(afterDelete.workspaces.length, 1, "after delete should keep one workspace");

  const clearResp = await fetchJson(`${base}/api/workspaces`, {
    method: "DELETE",
  });
  assert.equal(clearResp.removedCount, 1, "clear endpoint should remove remaining workspace");

  const afterClear = await fetchJson(`${base}/api/index`);
  assert.equal(afterClear.workspaces.length, 0, "after clear should keep zero workspace");

  await app.close();
  await fs.rm(dataDir, { recursive: true, force: true });
  console.log("verify: ok");
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
