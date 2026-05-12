import { describe, expect, test } from "vitest";
import { getDefaultLanguage, t, type Language } from "./i18n";

describe("i18n", () => {
  test.each<Language>(["en", "zh"])("has core dashboard labels for %s", (language) => {
    expect(t(language, "app.eyebrow")).toBeTruthy();
    expect(t(language, "actions.sync")).toBeTruthy();
    expect(t(language, "detail.lifecycleHelp")).toContain(language === "zh" ? "不" : "not");
    expect(t(language, "editor.protected")).toBeTruthy();
    expect(t(language, "skill.select", { name: "agents-sdk" })).toContain("agents-sdk");
    expect(t(language, "editor.unsaved")).toBeTruthy();
  });

  test("defaults to Chinese for zh browser locales", () => {
    expect(getDefaultLanguage("zh-CN")).toBe("zh");
    expect(getDefaultLanguage("en-US")).toBe("en");
  });
});
