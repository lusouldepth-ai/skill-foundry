import { describe, expect, test } from "vitest";
import { getSkillVisual } from "./skillVisuals";

describe("getSkillVisual", () => {
  test("classifies ChatGPT app skills as app tooling", () => {
    const visual = getSkillVisual({
      id: "plugin:build-chatgpt-app",
      name: "build-chatgpt-app",
      description: "Build, scaffold, refactor, and troubleshoot ChatGPT Apps SDK applications."
    });

    expect(visual.category).toBe("apps");
    expect(visual.icon).toBe("blocks");
    expect(visual.label).not.toMatch(/[A-Z]{1,3}/);
  });

  test("classifies browser automation skills distinctly", () => {
    const visual = getSkillVisual({
      id: "plugin:browser",
      name: "browser",
      description: "Browser automation for local targets and screenshots."
    });

    expect(visual.category).toBe("browser");
    expect(visual.icon).toBe("globe");
  });
});
