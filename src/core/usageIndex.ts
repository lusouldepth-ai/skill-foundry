import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import type { SkillRecord } from "./skillScanner";

export interface SkillUsageEvidence {
  detectedUsedAt?: string;
}

export type SkillUsageMap = Record<string, SkillUsageEvidence>;

export class SessionUsageIndex {
  private readonly scannedFiles = new Map<string, number>();
  private readonly usageBySkill = new Map<string, string>();

  constructor(private readonly roots: string[]) {}

  async read(skills: SkillRecord[]): Promise<SkillUsageMap> {
    const files = await collectJsonlFiles(this.roots);

    for (const file of files) {
      const fileStats = await stat(file);
      if (this.scannedFiles.get(file) === fileStats.mtimeMs) {
        continue;
      }
      await this.scanFile(file, skills);
      this.scannedFiles.set(file, fileStats.mtimeMs);
    }

    return Object.fromEntries(
      Array.from(this.usageBySkill.entries()).map(([skillId, detectedUsedAt]) => [skillId, { detectedUsedAt }])
    );
  }

  private async scanFile(file: string, skills: SkillRecord[]) {
    const lines = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity
    });

    for await (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = parseJsonLine(line);
      if (!event) {
        continue;
      }

      const timestamp = typeof event.timestamp === "string" ? event.timestamp : undefined;
      if (!timestamp) {
        continue;
      }

      const evidence = extractEvidenceText(event);
      if (!evidence) {
        continue;
      }

      for (const skill of skills) {
        if (matchesSkillEvidence(evidence, skill)) {
          this.recordUse(skill.id, timestamp);
        }
      }
    }
  }

  private recordUse(skillId: string, timestamp: string) {
    const current = this.usageBySkill.get(skillId);
    if (!current || new Date(timestamp).getTime() > new Date(current).getTime()) {
      this.usageBySkill.set(skillId, timestamp);
    }
  }
}

async function collectJsonlFiles(roots: string[]): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }

  await Promise.all(roots.map((root) => walk(root)));
  return files;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractEvidenceText(event: Record<string, unknown>): string {
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const typedPayload = payload as Record<string, unknown>;
  if (typedPayload.type === "function_call" && typeof typedPayload.arguments === "string") {
    return typedPayload.arguments;
  }

  if (typedPayload.type === "message" && typedPayload.role === "assistant" && Array.isArray(typedPayload.content)) {
    return typedPayload.content
      .map((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) {
          return "";
        }
        const typedPart = part as Record<string, unknown>;
        return typeof typedPart.text === "string" ? typedPart.text : "";
      })
      .join("\n");
  }

  if (typedPayload.type === "agent_message" && typeof typedPayload.message === "string") {
    return typedPayload.message;
  }

  return "";
}

function matchesSkillEvidence(value: string, skill: SkillRecord): boolean {
  if (value.includes(skill.skillFile)) {
    return true;
  }

  const normalizedFile = skill.skillFile.split(path.sep).join("/");
  if (value.includes(normalizedFile)) {
    return true;
  }

  const escapedName = escapeRegExp(skill.name);
  const announcedSkill = new RegExp(`(?:using|use|使用)\\s+[\`'"]?${escapedName}[\`'"]?\\s*(?:skill)?`, "i");
  return announcedSkill.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
