import { mkdtemp, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { quarantineSkill } from "./quarantine";

describe("quarantineSkill", () => {
  test("moves a manageable custom skill into quarantine", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-quarantine-"));
    const skillDir = path.join(root, "alpha");
    const quarantineDir = path.join(root, ".quarantine");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "# Alpha");

    const result = await quarantineSkill({
      skillDirectory: skillDir,
      skillId: "custom:alpha",
      sourceKind: "custom",
      allowedRoots: [root],
      quarantineRoot: quarantineDir
    });

    expect(result.destination).toContain(".quarantine");
    await expect(stat(result.destination)).resolves.toBeTruthy();
    await expect(stat(skillDir)).rejects.toThrow();
  });

  test("rejects protected plugin skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-quarantine-"));
    const skillDir = path.join(root, "plugin-skill");
    await mkdir(skillDir, { recursive: true });

    await expect(
      quarantineSkill({
        skillDirectory: skillDir,
        skillId: "plugin:browser",
        sourceKind: "plugin",
        allowedRoots: [root],
        quarantineRoot: path.join(root, ".quarantine")
      })
    ).rejects.toThrow("protected");
  });
});
