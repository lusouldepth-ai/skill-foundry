export type SkillVisualCategory =
  | "ai"
  | "apps"
  | "browser"
  | "code"
  | "data"
  | "design"
  | "docs"
  | "media"
  | "review"
  | "security"
  | "workflow"
  | "communication"
  | "terminal"
  | "generic";

export type SkillVisualIcon =
  | "bot"
  | "blocks"
  | "globe"
  | "braces"
  | "database"
  | "brush"
  | "file"
  | "media"
  | "shield"
  | "check"
  | "workflow"
  | "mail"
  | "terminal"
  | "spark";

export interface SkillVisualInput {
  id: string;
  name: string;
  description: string;
}

export interface SkillVisual {
  category: SkillVisualCategory;
  icon: SkillVisualIcon;
  label: string;
  hue: number;
  variant: number;
}

const rules: Array<{ category: SkillVisualCategory; icon: SkillVisualIcon; terms: string[] }> = [
  { category: "apps", icon: "blocks", terms: ["chatgpt app", "mcp", "app", "plugin", "widget"] },
  { category: "browser", icon: "globe", terms: ["browser", "chrome", "playwright", "web", "scrape", "website"] },
  { category: "ai", icon: "bot", terms: ["agent", "openai", "llm", "eval", "prompt", "ai"] },
  { category: "docs", icon: "file", terms: ["doc", "pdf", "ppt", "presentation", "readme", "markdown", "wechat"] },
  { category: "data", icon: "database", terms: ["spreadsheet", "xlsx", "csv", "database", "graph", "knowledge"] },
  { category: "design", icon: "brush", terms: ["design", "frontend", "ui", "prototype", "image", "visual"] },
  { category: "media", icon: "media", terms: ["video", "remotion", "hyperframes", "animation", "audio"] },
  { category: "review", icon: "check", terms: ["review", "audit", "verify", "test", "debug", "fix", "ci"] },
  { category: "security", icon: "shield", terms: ["security", "secure", "permission", "auth", "risk"] },
  { category: "workflow", icon: "workflow", terms: ["gsd", "plan", "execute", "workflow", "milestone", "roadmap"] },
  { category: "communication", icon: "mail", terms: ["gmail", "mail", "meeting", "calendar", "notion", "slack"] },
  { category: "terminal", icon: "terminal", terms: ["cli", "terminal", "shell", "command", "deploy"] }
];

export function getSkillVisual(skill: SkillVisualInput): SkillVisual {
  const text = `${skill.name} ${skill.description}`.toLowerCase();
  const match = rules.find((rule) => rule.terms.some((term) => text.includes(term)));
  const hashValue = hash(skill.id || skill.name);
  const category = match?.category ?? "generic";

  return {
    category,
    icon: match?.icon ?? "spark",
    label: category,
    hue: 172 + (hashValue % 42),
    variant: hashValue % 5
  };
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}
