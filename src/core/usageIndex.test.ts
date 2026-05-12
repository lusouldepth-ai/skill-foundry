import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { SkillRecord } from "./skillScanner";
import { SessionUsageIndex } from "./usageIndex";

function skill(overrides: Partial<SkillRecord>): SkillRecord {
  return {
    id: "custom:alpha",
    name: "alpha",
    description: "Alpha skill",
    directory: "/tmp/alpha",
    skillFile: "/tmp/alpha/SKILL.md",
    rootLabel: "custom",
    sourceKind: "custom",
    riskLevel: "manageable",
    descriptionMissing: false,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    sizeBytes: 20,
    bodyPreview: "Alpha",
    ...overrides
  };
}

describe("SessionUsageIndex", () => {
  test("detects skill use from a SKILL.md read in a Codex session", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-dashboard-usage-"));
    await mkdir(path.join(root, "2026", "05", "12"), { recursive: true });
    const sessionFile = path.join(root, "2026", "05", "12", "rollout.jsonl");
    const usedAt = "2026-05-12T09:10:00.000Z";
    const skillFile = path.join(root, "skills", "alpha", "SKILL.md");

    await writeFile(
      sessionFile,
      `${JSON.stringify({
        timestamp: usedAt,
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: `sed -n '1,120p' ${skillFile}` })
        }
      })}\n`,
      "utf8"
    );

    const usage = await new SessionUsageIndex([root]).read([skill({ skillFile })]);

    expect(usage["custom:alpha"]).toEqual({ detectedUsedAt: usedAt });
  });
});
