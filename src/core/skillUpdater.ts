import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { updateSkillContent } from "./fileEditor";
import type { SkillSourceKind } from "./skillScanner";

export type SkillUpdateStatus =
  | "untracked"
  | "plugin-managed"
  | "up-to-date"
  | "update-available"
  | "local-changes"
  | "error";

export interface GitHubSkillSource {
  type: "github";
  repo: string;
  path: string;
  ref: string;
  url?: string;
  installedHash?: string;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
}

export type SkillSourceInput =
  | {
      url: string;
      installedHash?: string;
    }
  | {
      repo: string;
      path: string;
      ref?: string;
      installedHash?: string;
    };

export interface SkillUpdateInfo {
  status: SkillUpdateStatus;
  source?: GitHubSkillSource;
  localHash?: string;
  remoteHash?: string;
  remoteUrl?: string;
  message?: string;
}

export type FetchText = (url: string) => Promise<string>;
export type SkillSourceMap = Record<string, GitHubSkillSource>;

export function normalizeGitHubSource(input: SkillSourceInput): GitHubSkillSource {
  if ("url" in input) {
    const parsed = parseGitHubUrl(input.url);
    return {
      type: "github",
      repo: parsed.repo,
      ref: parsed.ref,
      path: parsed.path,
      url: input.url,
      installedHash: input.installedHash
    };
  }

  return {
    type: "github",
    repo: normalizeRepo(input.repo),
    ref: input.ref?.trim() || "main",
    path: normalizeSourcePath(input.path),
    installedHash: input.installedHash
  };
}

export function sourceFromGitRemote(remoteUrl: string, skillPath: string, ref = "main"): GitHubSkillSource | undefined {
  const repo = repoFromGitRemote(remoteUrl);
  if (!repo) {
    return undefined;
  }
  return {
    type: "github",
    repo,
    ref: ref.trim() || "main",
    path: normalizeSourcePath(skillPath)
  };
}

export async function inspectGitHubSkillUpdate(input: {
  skillFile: string;
  sourceKind: SkillSourceKind;
  source?: GitHubSkillSource;
  fetchText: FetchText;
}): Promise<SkillUpdateInfo> {
  if (!input.source) {
    return {
      status: input.sourceKind === "plugin" || input.sourceKind === "system" ? "plugin-managed" : "untracked",
      message:
        input.sourceKind === "plugin" || input.sourceKind === "system"
          ? "This skill is managed by its plugin or system provider."
          : "No GitHub source is registered for this skill."
    };
  }

  try {
    const localContent = await readFile(input.skillFile, "utf8");
    const localHash = hashSkillContent(localContent);
    const remoteUrl = buildRawSkillUrl(input.source);
    const remoteContent = await input.fetchText(remoteUrl);
    const remoteHash = hashSkillContent(remoteContent);

    if (input.source.installedHash && input.source.installedHash !== localHash) {
      return { status: "local-changes", source: input.source, localHash, remoteHash, remoteUrl };
    }

    return {
      status: localHash === remoteHash ? "up-to-date" : "update-available",
      source: input.source,
      localHash,
      remoteHash,
      remoteUrl
    };
  } catch (error) {
    return {
      status: "error",
      source: input.source,
      message: error instanceof Error ? error.message : "Unable to inspect skill update."
    };
  }
}

export async function applyGitHubSkillUpdate(input: {
  skillFile: string;
  skillId: string;
  sourceKind: SkillSourceKind;
  allowedRoots: string[];
  backupRoot: string;
  source: GitHubSkillSource;
  fetchText: FetchText;
}): Promise<{ backupPath: string; source: GitHubSkillSource }> {
  if (input.sourceKind === "plugin" || input.sourceKind === "system") {
    throw new Error("Plugin and system skills should be updated through their provider, not overwritten directly.");
  }

  const localContent = await readFile(input.skillFile, "utf8");
  const localHash = hashSkillContent(localContent);
  if (input.source.installedHash && input.source.installedHash !== localHash) {
    throw new Error("Local changes detected. Review the diff before updating this skill.");
  }

  const remoteContent = await input.fetchText(buildRawSkillUrl(input.source));
  const result = await updateSkillContent({
    skillFile: input.skillFile,
    skillId: input.skillId,
    sourceKind: input.sourceKind,
    allowedRoots: input.allowedRoots,
    backupRoot: input.backupRoot,
    content: remoteContent
  });

  return {
    backupPath: result.backupPath,
    source: {
      ...input.source,
      installedHash: hashSkillContent(remoteContent),
      lastUpdatedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString()
    }
  };
}

export function buildRawSkillUrl(source: GitHubSkillSource): string {
  const skillFilePath = source.path === "." ? "SKILL.md" : `${source.path}/SKILL.md`;
  return `https://raw.githubusercontent.com/${source.repo}/${encodeURIComponent(source.ref)}/${skillFilePath}`;
}

export function hashSkillContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export class SkillSourceStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<SkillSourceMap> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SkillSourceMap) : {};
    } catch (error) {
      if (isMissingFile(error)) {
        return {};
      }
      throw error;
    }
  }

  async update(skillId: string, source: GitHubSkillSource): Promise<SkillSourceMap> {
    const sources = await this.read();
    sources[skillId] = source;
    await this.write(sources);
    return sources;
  }

  async write(sources: SkillSourceMap): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function parseGitHubUrl(url: string): { repo: string; ref: string; path: string } {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") {
    throw new Error("Only github.com skill URLs are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "tree") {
    throw new Error("Use a GitHub tree URL that points to the skill directory.");
  }

  return {
    repo: normalizeRepo(`${parts[0]}/${parts[1]}`),
    ref: parts[3],
    path: normalizeSourcePath(parts.slice(4).join("/"))
  };
}

function normalizeRepo(repo: string): string {
  const normalized = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  if (!/^[^/]+\/[^/]+$/.test(normalized)) {
    throw new Error("GitHub repo must use owner/repo format.");
  }
  return normalized;
}

function repoFromGitRemote(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch?.[1]) {
    return normalizeRepo(sshMatch[1]);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== "github.com") {
      return undefined;
    }
    return normalizeRepo(parsed.pathname);
  } catch {
    return undefined;
  }
}

function normalizeSourcePath(sourcePath: string): string {
  const normalized = sourcePath.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return ".";
  }
  if (normalized.includes("..")) {
    throw new Error("GitHub skill path is invalid.");
  }
  return normalized;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
