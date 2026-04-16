import path from "node:path";
import os from "node:os";

export const APP_DIRNAME = ".spec-readr";
export const REGISTRY_FILENAME = "workspaces.json";
export const CACHE_FILENAME = "index-cache.json";
export const RUNTIME_FILENAME = "runtime.json";
export const HISTORY_FILENAME = "history.json";

export function resolveDataDir(cwd = process.cwd()) {
  const fromEnv = process.env.SPEC_READR_DATA_DIR ?? process.env.READR_DATA_DIR;
  return fromEnv ? path.resolve(fromEnv) : path.join(os.homedir(), APP_DIRNAME);
}
