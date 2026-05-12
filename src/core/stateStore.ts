import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillRecord } from "./skillScanner";
import type { SkillUsageMap } from "./usageIndex";

export type Lifecycle = "active" | "optimize" | "archive" | "quarantined";
export type ActivitySource = "manual" | "session" | "modified";
export type DuplicateRecommendedAction = "keep" | "archive";

export interface SkillUserState {
  lifecycle?: Lifecycle;
  favorite?: boolean;
  notes?: string;
  lastUsedAt?: string;
  updatedAt?: string;
  quarantinedAt?: string;
  quarantinePath?: string;
}

export type SkillStateMap = Record<string, SkillUserState>;

export type SkillView = SkillRecord &
  Required<Pick<SkillUserState, "lifecycle" | "favorite" | "notes">> &
  Pick<SkillUserState, "lastUsedAt" | "updatedAt" | "quarantinedAt" | "quarantinePath"> & {
    detectedUsedAt?: string;
    lastActivityAt: string;
    lastActivitySource: ActivitySource;
    duplicateGroupId?: string;
    duplicateGroupSize?: number;
    duplicateRank?: number;
    duplicateRecommendedAction?: DuplicateRecommendedAction;
  };

export function mergeSkillState(skills: SkillRecord[], state: SkillStateMap, usage: SkillUsageMap = {}): SkillView[] {
  const merged = skills.map((skill) => {
    const saved = state[skill.id] ?? {};
    const detectedUsedAt = usage[skill.id]?.detectedUsedAt;
    const activity = latestActivity([
      { value: saved.lastUsedAt, source: "manual" },
      { value: detectedUsedAt, source: "session" },
      { value: skill.modifiedAt, source: "modified" }
    ]);

    return {
      ...skill,
      lifecycle: saved.lifecycle ?? "active",
      favorite: saved.favorite ?? false,
      notes: saved.notes ?? "",
      lastUsedAt: saved.lastUsedAt,
      detectedUsedAt,
      lastActivityAt: activity.value,
      lastActivitySource: activity.source,
      updatedAt: saved.updatedAt,
      quarantinedAt: saved.quarantinedAt,
      quarantinePath: saved.quarantinePath
    };
  });

  return annotateDuplicateGroups(merged);
}

function latestActivity(candidates: Array<{ value?: string; source: ActivitySource }>): { value: string; source: ActivitySource } {
  let latest = { value: "1970-01-01T00:00:00.000Z", source: "modified" as ActivitySource };

  for (const candidate of candidates) {
    if (!candidate.value) {
      continue;
    }
    const candidateTime = new Date(candidate.value).getTime();
    const latestTime = new Date(latest.value).getTime();
    if (Number.isFinite(candidateTime) && candidateTime > latestTime) {
      latest = { value: candidate.value, source: candidate.source };
    }
  }

  return latest;
}

function annotateDuplicateGroups(skills: SkillView[]): SkillView[] {
  const groups = new Map<string, SkillView[]>();

  for (const skill of skills) {
    const groupId = normalizeDuplicateKey(skill.name);
    if (!groupId) {
      continue;
    }
    groups.set(groupId, [...(groups.get(groupId) ?? []), skill]);
  }

  for (const [groupId, group] of groups.entries()) {
    if (group.length < 2) {
      continue;
    }

    const ranked = [...group].sort(compareDuplicateCandidates);
    ranked.forEach((skill, index) => {
      skill.duplicateGroupId = groupId;
      skill.duplicateGroupSize = group.length;
      skill.duplicateRank = index + 1;
      skill.duplicateRecommendedAction = index === 0 ? "keep" : "archive";
    });
  }

  return skills;
}

function normalizeDuplicateKey(name: string): string {
  return name.trim().toLowerCase();
}

function compareDuplicateCandidates(a: SkillView, b: SkillView): number {
  return (
    scoreLifecycle(b) - scoreLifecycle(a) ||
    Number(b.favorite) - Number(a.favorite) ||
    scoreSource(b) - scoreSource(a) ||
    timeValue(b.lastActivityAt) - timeValue(a.lastActivityAt) ||
    timeValue(b.modifiedAt) - timeValue(a.modifiedAt) ||
    a.id.localeCompare(b.id)
  );
}

function scoreLifecycle(skill: SkillView): number {
  if (skill.lifecycle === "active" || skill.lifecycle === "optimize") {
    return 2;
  }
  if (skill.lifecycle === "archive") {
    return 1;
  }
  return 0;
}

function scoreSource(skill: SkillView): number {
  if (skill.sourceKind === "custom") {
    return 3;
  }
  if (skill.sourceKind === "plugin") {
    return 2;
  }
  if (skill.sourceKind === "system") {
    return 1;
  }
  return 0;
}

function timeValue(value?: string): number {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export class StateStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<SkillStateMap> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SkillStateMap) : {};
    } catch (error) {
      if (isMissingFile(error)) {
        return {};
      }
      throw error;
    }
  }

  async update(skillId: string, patch: SkillUserState): Promise<SkillStateMap> {
    const state = await this.read();
    state[skillId] = {
      ...(state[skillId] ?? {}),
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await this.write(state);
    return state;
  }

  async write(state: SkillStateMap): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
