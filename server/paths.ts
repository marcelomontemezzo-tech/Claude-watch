import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();
export const CLAUDE_DIR = path.join(HOME, ".claude");
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
export const PLUGINS_DIR = path.join(CLAUDE_DIR, "plugins");
export const PLUGINS_MANIFEST = path.join(PLUGINS_DIR, "installed_plugins.json");
export const PLUGINS_CACHE = path.join(PLUGINS_DIR, "cache");
export const WATCH_DIR = path.join(CLAUDE_DIR, "watch");
export const ACTIVE_FILE = path.join(WATCH_DIR, "active.json");
export const QUEUE_FILE = path.join(WATCH_DIR, "queue.ndjson");

const WIN_DRIVE_KEY = /^([A-Za-z])--/;

export function projectKeyToCwd(key: string): string {
  if (WIN_DRIVE_KEY.test(key)) {
    return key.replace(WIN_DRIVE_KEY, "$1:\\").replace(/-/g, "\\");
  }
  if (key.startsWith("-")) {
    return "/" + key.slice(1).replace(/-/g, "/");
  }
  return key.replace(/-/g, path.sep);
}

export function projectDisplayName(key: string, cwd?: string): string {
  if (cwd) {
    const base = path.basename(cwd);
    if (base) return base;
  }
  const stripped = key.replace(WIN_DRIVE_KEY, "").replace(/^-+/, "");
  const segments = stripped.split("-").filter(Boolean);
  return segments[segments.length - 1] ?? key;
}
