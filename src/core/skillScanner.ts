import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export type SkillSourceKind = "custom" | "system" | "plugin" | "unknown";
export type RiskLevel = "manageable" | "protected" | "review";

export interface ScanRoot {
  label: string;
  path: string;
  kind: SkillSourceKind;
}

export interface ParsedSkillFile {
  name: string;
  description: string;
  bodyPreview: string;
  frontMatter: Record<string, unknown>;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  directory: string;
  skillFile: string;
  rootLabel: string;
  sourceKind: SkillSourceKind;
  riskLevel: RiskLevel;
  descriptionMissing: boolean;
  modifiedAt: string;
  sizeBytes: number;
  bodyPreview: string;
}

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseSkillFile(content: string): ParsedSkillFile {
  const match = content.match(FRONT_MATTER_PATTERN);
  const frontMatter = parseFrontMatter(match?.[1] ?? "");
  const body = match ? content.slice(match[0].length) : content;
  const bodyWithoutHeadings = body
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const bodyText = normalizeWhitespace(body.replace(/^#+\s*/gm, ""));
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstParagraph = bodyWithoutHeadings
    .split(/\r?\n\r?\n/)
    .map((part) => normalizeWhitespace(part))
    .find(Boolean);

  const frontMatterName = asString(frontMatter.name);
  const frontMatterDescription = asString(frontMatter.description);
  const name = frontMatterName || heading || "Unnamed skill";
  const description = frontMatterDescription || firstParagraph || "";

  return {
    name,
    description,
    bodyPreview: bodyText.slice(0, 800),
    frontMatter
  };
}

export async function scanSkillRoots(roots: ScanRoot[]): Promise<SkillRecord[]> {
  const records: SkillRecord[] = [];
  const seenSkillFiles = new Set<string>();

  for (const root of roots) {
    const rootPath = path.resolve(root.path);
    const files = await findSkillFiles(rootPath);

    for (const skillFile of files) {
      const resolvedSkillFile = path.resolve(skillFile);
      if (seenSkillFiles.has(resolvedSkillFile)) {
        continue;
      }
      seenSkillFiles.add(resolvedSkillFile);

      const content = await readFile(skillFile, "utf8");
      const parsed = parseSkillFile(content);
      const fileStats = await stat(skillFile);
      const directory = path.dirname(skillFile);
      const relativeDirectory = path.relative(rootPath, directory) || path.basename(directory);

      records.push({
        id: buildSkillId(root.label, relativeDirectory),
        name: parsed.name,
        description: parsed.description,
        directory,
        skillFile,
        rootLabel: root.label,
        sourceKind: root.kind,
        riskLevel: riskLevelFor(root.kind),
        descriptionMissing: parsed.description.trim().length === 0,
        modifiedAt: fileStats.mtime.toISOString(),
        sizeBytes: fileStats.size,
        bodyPreview: parsed.bodyPreview
      });
    }
  }

  return records.sort((a, b) => a.name.localeCompare(b.name) || a.skillFile.localeCompare(b.skillFile));
}

function parseFrontMatter(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }

  const parsed = YAML.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

async function findSkillFiles(root: string): Promise<string[]> {
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
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(entryPath);
      }
    }
  }

  await walk(root);
  return files;
}

function buildSkillId(rootLabel: string, relativeDirectory: string): string {
  const normalized = relativeDirectory.split(path.sep).join("/");
  return `${rootLabel}:${normalized}`;
}

function riskLevelFor(kind: SkillSourceKind): RiskLevel {
  if (kind === "custom") {
    return "manageable";
  }
  if (kind === "plugin" || kind === "system") {
    return "protected";
  }
  return "review";
}

function shouldSkipDirectory(name: string): boolean {
  return name === "node_modules" || name === ".git" || name === "dist" || name === "coverage";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
