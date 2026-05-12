import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { SkillRecord } from "./skillScanner";
import { mergeSkillState, StateStore } from "./stateStore";

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

describe("mergeSkillState", () => {
  test("adds user lifecycle data without overwriting scanned metadata", () => {
    const merged = mergeSkillState([skill({ id: "custom:alpha", name: "alpha" })], {
      "custom:alpha": {
        lifecycle: "optimize",
        favorite: true,
        notes: "Improve examples",
        lastUsedAt: "2026-02-01T00:00:00.000Z"
      }
    });

    expect(merged[0].name).toBe("alpha");
    expect(merged[0].lifecycle).toBe("optimize");
    expect(merged[0].favorite).toBe(true);
    expect(merged[0].notes).toBe("Improve examples");
    expect(merged[0].lastActivitySource).toBe("manual");
  });

  test("uses detected session activity when it is newer than file changes", () => {
    const merged = mergeSkillState(
      [skill({ id: "custom:alpha", modifiedAt: "2026-01-01T00:00:00.000Z" })],
      {},
      { "custom:alpha": { detectedUsedAt: "2026-03-01T00:00:00.000Z" } }
    );

    expect(merged[0].lastActivityAt).toBe("2026-03-01T00:00:00.000Z");
    expect(merged[0].lastActivitySource).toBe("session");
  });
});

describe("StateStore", () => {
  test("persists state updates by skill id", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skill-dashboard-state-"));
    const store = new StateStore(path.join(dir, "state.json"));

    await store.update("custom:alpha", { lifecycle: "archive", notes: "Old" });
    const state = await store.read();

    expect(state["custom:alpha"]).toMatchObject({ lifecycle: "archive", notes: "Old" });
  });
});
