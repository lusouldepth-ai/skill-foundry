import os from "node:os";
import path from "node:path";
import type { ScanRoot } from "../core/skillScanner";

export interface AppConfig {
  projectRoot: string;
  dataDir: string;
  stateFile: string;
  quarantineDir: string;
  backupDir: string;
  scanRoots: ScanRoot[];
  port: number;
}

export function loadConfig(): AppConfig {
  const projectRoot = process.cwd();
  const dataDir = process.env.SKILL_DASHBOARD_DATA_DIR
    ? expandHome(process.env.SKILL_DASHBOARD_DATA_DIR)
    : path.join(projectRoot, "data");
  const scanRoots = process.env.SKILL_DASHBOARD_ROOTS
    ? parseRoots(process.env.SKILL_DASHBOARD_ROOTS)
    : defaultRoots();

  return {
    projectRoot,
    dataDir,
    stateFile: path.join(dataDir, "skill-state.json"),
    quarantineDir: path.join(dataDir, "quarantine"),
    backupDir: path.join(dataDir, "backups"),
    scanRoots,
    port: Number(process.env.PORT ?? 5173)
  };
}

export function manageableRoots(roots: ScanRoot[]): string[] {
  return roots.filter((root) => root.kind === "custom").map((root) => expandHome(root.path));
}

function defaultRoots(): ScanRoot[] {
  const roots: ScanRoot[] = [
    { label: "codex-system", path: "~/.codex/skills/.system", kind: "system" },
    { label: "codex-user", path: "~/.codex/skills", kind: "custom" },
    { label: "agents-user", path: "~/.agents/skills", kind: "custom" },
    { label: "plugin-cache", path: "~/.codex/plugins/cache", kind: "plugin" }
  ];
  return roots.map((root) => ({ ...root, path: expandHome(root.path) }));
}

function parseRoots(value: string): ScanRoot[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [kind = "custom", rootPath = part, label = `root-${index + 1}`] = part.split(":");
      return {
        label,
        path: expandHome(rootPath),
        kind: isKnownKind(kind) ? kind : "custom"
      };
    });
}

function isKnownKind(value: string): value is ScanRoot["kind"] {
  return value === "custom" || value === "system" || value === "plugin" || value === "unknown";
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
