import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();
export const CLAUDE_DIR = path.join(HOME, ".claude");
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
export const PLUGINS_DIR = path.join(CLAUDE_DIR, "plugins");
export const WATCH_DIR = path.join(CLAUDE_DIR, "watch");
export const ACTIVE_FILE = path.join(WATCH_DIR, "active.json");
export const QUEUE_FILE = path.join(WATCH_DIR, "queue.ndjson");

export function projectKeyToCwd(key: string): string {
  return key.replace(/^([A-Za-z])--/, "$1:\\").replace(/-/g, "\\");
}

export function projectDisplayName(key: string): string {
  const segments = key.split(/--?/).filter(Boolean);
  const tail = segments.slice(-3).join("/");
  return tail || key;
}
