import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillSourceKind } from "./skillScanner";

export interface UpdateSkillContentInput {
  skillFile: string;
  skillId: string;
  sourceKind: SkillSourceKind;
  allowedRoots: string[];
  backupRoot: string;
  content: string;
}

export interface UpdateSkillContentResult {
  backupPath: string;
}

export async function updateSkillContent(input: UpdateSkillContentInput): Promise<UpdateSkillContentResult> {
  if (input.sourceKind === "plugin" || input.sourceKind === "system") {
    throw new Error("This skill is protected and cannot be edited by the dashboard.");
  }

  if (path.basename(input.skillFile) !== "SKILL.md") {
    throw new Error("Only SKILL.md files can be edited.");
  }

  if (!input.content.trim()) {
    throw new Error("Skill content cannot be empty.");
  }

  const skillFile = await realpath(input.skillFile);
  const allowedRoots = await existingRealRoots(input.allowedRoots);
  if (!allowedRoots.some((root) => isInsideRoot(skillFile, root))) {
    throw new Error("Skill file is outside the configured safe roots.");
  }

  const fileStats = await stat(skillFile);
  if (!fileStats.isFile()) {
    throw new Error("Skill file is not a regular file.");
  }

  const previousContent = await readFile(skillFile, "utf8");
  const backupPath = await writeBackup(input.backupRoot, input.skillId, previousContent);
  const temporaryPath = `${skillFile}.tmp`;
  await writeFile(temporaryPath, input.content, "utf8");
  await rename(temporaryPath, skillFile);

  return { backupPath };
}

async function writeBackup(backupRoot: string, skillId: string, content: string): Promise<string> {
  await mkdir(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupRoot, `${stamp}-${safeName(skillId)}-SKILL.md`);
  await writeFile(backupPath, content, "utf8");
  return backupPath;
}

async function existingRealRoots(roots: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const root of roots) {
    try {
      resolved.push(await realpath(root));
    } catch {
      // Missing roots cannot authorize edits.
    }
  }
  return resolved;
}

function isInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}
