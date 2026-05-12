import { quarantineSkill } from "./quarantine";
import type { Lifecycle } from "./stateStore";
import type { SkillSourceKind } from "./skillScanner";

export interface ArchivedSkillCandidate {
  id: string;
  directory: string;
  sourceKind: SkillSourceKind;
  lifecycle: Lifecycle;
}

export interface PurgedArchivedSkill {
  skillId: string;
  destination: string;
}

export async function purgeArchivedSkills(input: {
  skills: ArchivedSkillCandidate[];
  allowedRoots: string[];
  quarantineRoot: string;
}): Promise<PurgedArchivedSkill[]> {
  const purged: PurgedArchivedSkill[] = [];

  for (const skill of input.skills) {
    if (skill.lifecycle !== "archive") {
      continue;
    }

    const result = await quarantineSkill({
      skillDirectory: skill.directory,
      skillId: skill.id,
      sourceKind: skill.sourceKind,
      allowedRoots: input.allowedRoots,
      quarantineRoot: input.quarantineRoot
    });

    purged.push({ skillId: skill.id, destination: result.destination });
  }

  return purged;
}
