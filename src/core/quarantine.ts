import { mkdir, realpath, rename, stat } from "node:fs/promises";
import path from "node:path";
import type { SkillSourceKind } from "./skillScanner";

export interface QuarantineInput {
  skillDirectory: string;
  skillId: string;
  sourceKind: SkillSourceKind;
  allowedRoots: string[];
  quarantineRoot: string;
}

export interface QuarantineResult {
  destination: string;
  quarantinedProtectedSource: boolean;
}

export async function quarantineSkill(input: QuarantineInput): Promise<QuarantineResult> {
  const skillDirectory = await realpath(input.skillDirectory);
  const allowedRoots = await existingRealRoots(input.allowedRoots);
  if (!allowedRoots.some((root) => isInsideRoot(skillDirectory, root))) {
    throw new Error("Skill directory is outside the configured safe roots.");
  }

  const skillFile = path.join(skillDirectory, "SKILL.md");
  const fileStats = await stat(skillFile);
  if (!fileStats.isFile()) {
    throw new Error("Only directories containing SKILL.md can be quarantined.");
  }

  const quarantineRoot = path.resolve(input.quarantineRoot);
  await mkdir(quarantineRoot, { recursive: true });

  const destination = await nextAvailableDestination(quarantineRoot, safeName(input.skillId));
  await rename(skillDirectory, destination);

  return { destination, quarantinedProtectedSource: input.sourceKind === "plugin" || input.sourceKind === "system" };
}

async function existingRealRoots(roots: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const root of roots) {
    try {
      resolved.push(await realpath(root));
    } catch {
      // Missing roots are ignored; they cannot authorize a move.
    }
  }
  return resolved;
}

function isInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function nextAvailableDestination(quarantineRoot: string, name: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const destination = path.join(quarantineRoot, `${stamp}-${name}${suffix}`);
    try {
      await stat(destination);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return destination;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a quarantine destination.");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}
