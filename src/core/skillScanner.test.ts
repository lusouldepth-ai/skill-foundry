import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseSkillFile, scanSkillRoots } from "./skillScanner";

async function makeTempRoot() {
  return mkdtemp(path.join(tmpdir(), "skill-dashboard-scanner-"));
}

describe("parseSkillFile", () => {
  test("extracts front matter name and description", () => {
    const parsed = parseSkillFile(`---\nname: pdf\ndescription: Work with PDF files\n---\n# PDF\nUse this skill.`);

    expect(parsed.name).toBe("pdf");
    expect(parsed.description).toBe("Work with PDF files");
    expect(parsed.bodyPreview).toContain("Use this skill");
  });

  test("falls back to heading when front matter is absent", () => {
    const parsed = parseSkillFile("# Local Tool\n\nA plain skill body.");

    expect(parsed.name).toBe("Local Tool");
    expect(parsed.description).toBe("A plain skill body.");
  });
});

describe("scanSkillRoots", () => {
  test("discovers nested SKILL.md files and classifies source roots", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "custom-one"), { recursive: true });
    await writeFile(
      path.join(root, "custom-one", "SKILL.md"),
      "---\nname: custom-one\ndescription: My custom workflow\n---\n# Body"
    );

    const skills = await scanSkillRoots([{ label: "custom", path: root, kind: "custom" }]);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "custom-one",
      description: "My custom workflow",
      sourceKind: "custom",
      rootLabel: "custom"
    });
    expect(skills[0].id).toContain("custom-one");
    expect(skills[0].riskLevel).toBe("manageable");
  });

  test("marks plugin-owned skills as protected", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "plugin", "skills", "browser"), { recursive: true });
    await writeFile(path.join(root, "plugin", "skills", "browser", "SKILL.md"), "---\nname: browser\n---\n# Browser");

    const skills = await scanSkillRoots([{ label: "plugins", path: root, kind: "plugin" }]);

    expect(skills[0].sourceKind).toBe("plugin");
    expect(skills[0].riskLevel).toBe("protected");
    expect(skills[0].descriptionMissing).toBe(true);
  });
});
