import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ScanConsentStore } from "./scanConsent";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("ScanConsentStore", () => {
  test("returns null before local scan consent is granted", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "skill-consent-"));
    const store = new ScanConsentStore(path.join(tempDir, "data", "scan-consent.json"));

    await expect(store.read()).resolves.toBeNull();
  });

  test("persists explicit local scan consent without skill content", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "skill-consent-"));
    const store = new ScanConsentStore(path.join(tempDir, "data", "scan-consent.json"));

    const consent = await store.grant({
      scanRoots: ["/Users/example/.codex/skills"],
      usageRoots: ["/Users/example/.codex/sessions"]
    });

    expect(consent).toMatchObject({
      version: 1,
      scope: "local-skill-scan",
      scanRoots: ["/Users/example/.codex/skills"],
      usageRoots: ["/Users/example/.codex/sessions"]
    });
    await expect(store.read()).resolves.toMatchObject(consent);
  });
});
