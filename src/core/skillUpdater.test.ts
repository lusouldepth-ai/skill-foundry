import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  applyGitHubSkillUpdate,
  hashSkillContent,
  inspectGitHubSkillUpdate,
  normalizeGitHubSource,
  SkillSourceStore,
  sourceFromGitRemote
} from "./skillUpdater";

describe("normalizeGitHubSource", () => {
  test("parses a GitHub tree URL pointing at a skill directory", () => {
    const source = normalizeGitHubSource({
      url: "https://github.com/openai/skills/tree/main/skills/.curated/example-skill"
    });

    expect(source).toMatchObject({
      type: "github",
      repo: "openai/skills",
      ref: "main",
      path: "skills/.curated/example-skill"
    });
  });

  test("converts a GitHub SSH remote into a source record", () => {
    const source = sourceFromGitRemote("git@github.com:owner/repo.git", "skills/demo", "main");

    expect(source).toMatchObject({
      type: "github",
      repo: "owner/repo",
      ref: "main",
      path: "skills/demo"
    });
  });
});

describe("inspectGitHubSkillUpdate", () => {
  test("reports an available update when remote SKILL.md differs from local content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-update-"));
    const skillFile = path.join(root, "SKILL.md");
    await writeFile(skillFile, "---\nname: demo\n---\n\n# Local\n", "utf8");

    const source = normalizeGitHubSource({
      repo: "owner/repo",
      path: "skills/demo",
      ref: "main",
      installedHash: hashSkillContent("---\nname: demo\n---\n\n# Local\n")
    });

    const result = await inspectGitHubSkillUpdate({
      skillFile,
      sourceKind: "custom",
      source,
      fetchText: async () => "---\nname: demo\n---\n\n# Remote\n"
    });

    expect(result.status).toBe("update-available");
    expect(result.remoteHash).not.toBe(result.localHash);
  });

  test("reports local changes before allowing an overwrite", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-update-"));
    const skillFile = path.join(root, "SKILL.md");
    await writeFile(skillFile, "---\nname: demo\n---\n\n# Local edit\n", "utf8");

    const source = normalizeGitHubSource({
      repo: "owner/repo",
      path: "skills/demo",
      ref: "main",
      installedHash: hashSkillContent("---\nname: demo\n---\n\n# Installed\n")
    });

    const result = await inspectGitHubSkillUpdate({
      skillFile,
      sourceKind: "custom",
      source,
      fetchText: async () => "---\nname: demo\n---\n\n# Remote\n"
    });

    expect(result.status).toBe("local-changes");
  });
});

describe("applyGitHubSkillUpdate", () => {
  test("backs up the current skill and writes the remote content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-update-"));
    const backupRoot = path.join(root, "backups");
    const skillDir = path.join(root, "demo");
    const skillFile = path.join(skillDir, "SKILL.md");
    await mkdir(skillDir);
    await writeFile(skillFile, "---\nname: demo\n---\n\n# Local\n", "utf8");

    const result = await applyGitHubSkillUpdate({
      skillFile,
      skillId: "custom:demo",
      sourceKind: "custom",
      allowedRoots: [root],
      backupRoot,
      source: normalizeGitHubSource({
        repo: "owner/repo",
        path: "skills/demo",
        ref: "main",
        installedHash: hashSkillContent("---\nname: demo\n---\n\n# Local\n")
      }),
      fetchText: async () => "---\nname: demo\n---\n\n# Remote\n"
    });

    expect(await readFile(skillFile, "utf8")).toContain("# Remote");
    expect(await readFile(result.backupPath, "utf8")).toContain("# Local");
    expect(result.source.installedHash).toBe(hashSkillContent("---\nname: demo\n---\n\n# Remote\n"));
  });
});

describe("SkillSourceStore", () => {
  test("persists GitHub source records by skill id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-source-store-"));
    const store = new SkillSourceStore(path.join(root, "sources.json"));

    await store.update("custom:demo", normalizeGitHubSource({ repo: "owner/repo", path: "skills/demo" }));

    expect(await store.read()).toMatchObject({
      "custom:demo": {
        type: "github",
        repo: "owner/repo",
        path: "skills/demo",
        ref: "main"
      }
    });
  });
});
