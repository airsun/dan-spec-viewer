import path from "node:path";

export const APP_DIRNAME = ".dan-spec-readr";
export const REGISTRY_FILENAME = "workspaces.json";
export const CACHE_FILENAME = "index-cache.json";

export function resolveDataDir(cwd = process.cwd()) {
  const fromEnv = process.env.READR_DATA_DIR;
  return fromEnv ? path.resolve(fromEnv) : path.join(cwd, APP_DIRNAME);
}
