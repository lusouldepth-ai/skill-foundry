import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { updateSkillContent } from "./fileEditor";

describe("updateSkillContent", () => {
  test("backs up and updates a manageable custom skill file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-editor-"));
    const skillDir = path.join(root, "alpha");
    const skillFile = path.join(skillDir, "SKILL.md");
    const backupRoot = path.join(root, ".backups");
    await mkdir(skillDir, { recursive: true });
    await writeFile(skillFile, "# Alpha\n\nOld body", "utf8");

    const result = await updateSkillContent({
      skillFile,
      skillId: "custom:alpha",
      sourceKind: "custom",
      allowedRoots: [root],
      backupRoot,
      content: "# Alpha\n\nNew body"
    });

    await expect(readFile(skillFile, "utf8")).resolves.toBe("# Alpha\n\nNew body");
    await expect(readFile(result.backupPath, "utf8")).resolves.toBe("# Alpha\n\nOld body");
  });

  test("rejects protected skill edits", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-editor-"));
    const skillFile = path.join(root, "SKILL.md");
    await writeFile(skillFile, "# Browser", "utf8");

    await expect(
      updateSkillContent({
        skillFile,
        skillId: "plugin:browser",
        sourceKind: "plugin",
        allowedRoots: [root],
        backupRoot: path.join(root, ".backups"),
        content: "# Browser\n\nChanged"
      })
    ).rejects.toThrow("protected");
  });
});
