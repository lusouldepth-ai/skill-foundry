import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { purgeArchivedSkills } from "./archiveCleanup";

describe("purgeArchivedSkills", () => {
  test("moves only archived skills into quarantine", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-archive-cleanup-"));
    const quarantineRoot = path.join(root, "quarantine");
    const archivedDir = path.join(root, "archived");
    const activeDir = path.join(root, "active");
    await mkdir(archivedDir);
    await mkdir(activeDir);
    await writeFile(path.join(archivedDir, "SKILL.md"), "# Archived", "utf8");
    await writeFile(path.join(activeDir, "SKILL.md"), "# Active", "utf8");

    const result = await purgeArchivedSkills({
      skills: [
        { id: "custom:archived", directory: archivedDir, sourceKind: "custom", lifecycle: "archive" },
        { id: "custom:active", directory: activeDir, sourceKind: "custom", lifecycle: "active" }
      ],
      allowedRoots: [root],
      quarantineRoot
    });

    expect(result).toHaveLength(1);
    expect(result[0].skillId).toBe("custom:archived");
    await expect(stat(result[0].destination)).resolves.toBeTruthy();
    await expect(stat(archivedDir)).rejects.toThrow();
    await expect(stat(activeDir)).resolves.toBeTruthy();
  });
});
