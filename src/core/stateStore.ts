import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillRecord } from "./skillScanner";

export type Lifecycle = "active" | "optimize" | "archive" | "quarantined";

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
  Pick<SkillUserState, "lastUsedAt" | "updatedAt" | "quarantinedAt" | "quarantinePath">;

export function mergeSkillState(skills: SkillRecord[], state: SkillStateMap): SkillView[] {
  return skills.map((skill) => {
    const saved = state[skill.id] ?? {};
    return {
      ...skill,
      lifecycle: saved.lifecycle ?? "active",
      favorite: saved.favorite ?? false,
      notes: saved.notes ?? "",
      lastUsedAt: saved.lastUsedAt,
      updatedAt: saved.updatedAt,
      quarantinedAt: saved.quarantinedAt,
      quarantinePath: saved.quarantinePath
    };
  });
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
