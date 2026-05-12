import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ScanConsent {
  version: 1;
  scope: "local-skill-scan";
  grantedAt: string;
  scanRoots: string[];
  usageRoots: string[];
}

export class ScanConsentStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<ScanConsent | null> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<ScanConsent>;
      if (parsed.version !== 1 || parsed.scope !== "local-skill-scan" || typeof parsed.grantedAt !== "string") {
        return null;
      }
      return {
        version: 1,
        scope: "local-skill-scan",
        grantedAt: parsed.grantedAt,
        scanRoots: Array.isArray(parsed.scanRoots) ? parsed.scanRoots.filter((item): item is string => typeof item === "string") : [],
        usageRoots: Array.isArray(parsed.usageRoots) ? parsed.usageRoots.filter((item): item is string => typeof item === "string") : []
      };
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  }

  async grant(input: { scanRoots: string[]; usageRoots: string[] }): Promise<ScanConsent> {
    const consent: ScanConsent = {
      version: 1,
      scope: "local-skill-scan",
      grantedAt: new Date().toISOString(),
      scanRoots: input.scanRoots,
      usageRoots: input.usageRoots
    };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(consent, null, 2)}\n`, "utf8");
    return consent;
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
