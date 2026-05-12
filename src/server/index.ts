import express from "express";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { purgeArchivedSkills } from "../core/archiveCleanup";
import { updateSkillContent } from "../core/fileEditor";
import { quarantineSkill } from "../core/quarantine";
import { ScanConsentStore } from "../core/scanConsent";
import { scanSkillRoots, type ScanRoot, type SkillRecord } from "../core/skillScanner";
import { mergeSkillState, StateStore, type SkillUserState, type SkillView } from "../core/stateStore";
import {
  applyGitHubSkillUpdate,
  hashSkillContent,
  inspectGitHubSkillUpdate,
  normalizeGitHubSource,
  sourceFromGitRemote,
  SkillSourceStore
} from "../core/skillUpdater";
import { SessionUsageIndex } from "../core/usageIndex";
import { allowedSkillRoots, loadConfig } from "./config";

const isDev = process.argv.includes("--dev");
const config = loadConfig();
const app = express();
const stateStore = new StateStore(config.stateFile);
const sourceStore = new SkillSourceStore(config.sourceFile);
const consentStore = new ScanConsentStore(config.consentFile);
const usageIndex = new SessionUsageIndex(config.usageRoots);
const execFileAsync = promisify(execFile);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/consent", async (_request, response, next) => {
  try {
    const consent = await consentStore.read();
    response.json({ hasConsent: Boolean(consent), consent: consent ? publicConsent(consent) : null });
  } catch (error) {
    next(error);
  }
});

app.post("/api/consent", async (_request, response, next) => {
  try {
    const consent = await consentStore.grant({
      scanRoots: config.scanRoots.map((root) => compactHomePath(root.path)),
      usageRoots: config.usageRoots.map(compactHomePath)
    });
    response.json({ hasConsent: true, consent: publicConsent(consent) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/skills", async (_request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    response.json(publicSkillsResponse(await scanAndMerge()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/scan", async (_request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    response.json(publicSkillsResponse(await scanAndMerge()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/duplicates/archive", async (_request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const current = await scanAndMerge();
    const duplicateCopies = current.skills.filter(
      (skill) => skill.duplicateRecommendedAction === "archive" && skill.lifecycle !== "archive"
    );

    for (const skill of duplicateCopies) {
      await stateStore.update(skill.id, { lifecycle: "archive" });
    }

    response.json({ ...publicSkillsResponse(await scanAndMerge()), archivedCount: duplicateCopies.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/duplicates/quarantine", async (_request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const current = await scanAndMerge();
    const duplicateCopies = current.skills.filter(
      (skill) => skill.duplicateRecommendedAction === "archive" && skill.lifecycle !== "quarantined"
    );
    const quarantined: Array<{ skillId: string; destination: string }> = [];
    const quarantinedAt = new Date().toISOString();

    for (const skill of duplicateCopies) {
      const result = await quarantineSkill({
        skillDirectory: skill.directory,
        skillId: skill.id,
        sourceKind: skill.sourceKind,
        allowedRoots: allowedSkillRoots(config.scanRoots),
        quarantineRoot: config.quarantineDir
      });

      await stateStore.update(skill.id, {
        lifecycle: "quarantined",
        quarantinedAt,
        quarantinePath: result.destination
      });
      quarantined.push({ skillId: skill.id, destination: compactHomePath(result.destination) });
    }

    response.json({ ...publicSkillsResponse(await scanAndMerge()), quarantinedCount: quarantined.length, quarantined });
  } catch (error) {
    next(error);
  }
});

app.post("/api/archive/purge", async (_request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const current = await scanAndMerge();
    const purged = await purgeArchivedSkills({
      skills: current.skills,
      allowedRoots: allowedSkillRoots(config.scanRoots),
      quarantineRoot: config.quarantineDir
    });

    for (const item of purged) {
      await stateStore.update(item.skillId, {
        lifecycle: "quarantined",
        quarantinedAt: new Date().toISOString(),
        quarantinePath: item.destination
      });
    }

    response.json({
      ...publicSkillsResponse(await scanAndMerge()),
      purgedCount: purged.length,
      purged: purged.map((item) => ({ ...item, destination: compactHomePath(item.destination) }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/skills/:id/update", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const skill = await findSkill(request.params.id);
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }

    const sources = await sourceStore.read();
    const source = sources[skill.id] ?? (await detectGitHubSource(skill));
    response.json(
      await inspectGitHubSkillUpdate({
        skillFile: skill.skillFile,
        sourceKind: skill.sourceKind,
        source,
        fetchText: fetchRemoteText
      })
    );
  } catch (error) {
    next(error);
  }
});

app.patch("/api/skills/:id/update-source", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const skill = await findSkill(request.params.id);
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }

    const content = await readFile(skill.skillFile, "utf8");
    const source = normalizeGitHubSource({ ...sourceInputFromRequest(request.body), installedHash: hashSkillContent(content) });
    await sourceStore.update(skill.id, source);

    response.json(
      await inspectGitHubSkillUpdate({
        skillFile: skill.skillFile,
        sourceKind: skill.sourceKind,
        source,
        fetchText: fetchRemoteText
      })
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/skills/:id/update", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const skill = await findSkill(request.params.id);
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }

    const sources = await sourceStore.read();
    const source = sources[skill.id] ?? (await detectGitHubSource(skill));
    if (!source) {
      response.status(400).json({ error: "No GitHub source is registered for this skill." });
      return;
    }

    const result = await applyGitHubSkillUpdate({
      skillFile: skill.skillFile,
      skillId: skill.id,
      sourceKind: skill.sourceKind,
      allowedRoots: allowedSkillRoots(config.scanRoots),
      backupRoot: config.backupDir,
      source,
      fetchText: fetchRemoteText
    });
    await sourceStore.update(skill.id, result.source);

    response.json({
      result: publicPathResult(result),
      update: await inspectGitHubSkillUpdate({
        skillFile: skill.skillFile,
        sourceKind: skill.sourceKind,
        source: result.source,
        fetchText: fetchRemoteText
      }),
      skills: publicSkillsResponse(await scanAndMerge())
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/skills/:id/content", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const skill = await findSkill(request.params.id);
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }
    const content = await readFile(skill.skillFile, "utf8");
    response.json({ id: skill.id, content });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/skills/:id/content", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const skill = await findSkill(request.params.id);
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }
    if (!request.body || typeof request.body.content !== "string") {
      response.status(400).json({ error: "Missing content" });
      return;
    }

    const result = await updateSkillContent({
      skillFile: skill.skillFile,
      skillId: skill.id,
      sourceKind: skill.sourceKind,
      allowedRoots: allowedSkillRoots(config.scanRoots),
      backupRoot: config.backupDir,
      content: request.body.content
    });

    response.json({ result: publicPathResult(result), skills: publicSkillsResponse(await scanAndMerge()) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/skills/:id/state", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const patch = sanitizeStatePatch(request.body);
    await stateStore.update(request.params.id, patch);
    response.json(publicSkillsResponse(await scanAndMerge()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/skills/:id/quarantine", async (request, response, next) => {
  try {
    if (!(await hasScanConsent(response))) {
      return;
    }
    const skill = await findSkill(request.params.id);
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }

    const result = await quarantineSkill({
      skillDirectory: skill.directory,
      skillId: skill.id,
      sourceKind: skill.sourceKind,
      allowedRoots: allowedSkillRoots(config.scanRoots),
      quarantineRoot: config.quarantineDir
    });

    await stateStore.update(skill.id, {
      lifecycle: "quarantined",
      quarantinedAt: new Date().toISOString(),
      quarantinePath: result.destination
    });

    response.json({ result: publicPathResult(result), skills: publicSkillsResponse(await scanAndMerge()) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/config", (_request, response) => {
  response.json({
    roots: config.scanRoots.map(publicScanRoot),
    usageRoots: config.usageRoots.map(compactHomePath),
    dataDir: compactHomePath(config.dataDir),
    consentFile: compactHomePath(config.consentFile),
    quarantineDir: compactHomePath(config.quarantineDir),
    backupDir: compactHomePath(config.backupDir),
    safety: {
      permanentDelete: false,
      protectedSources: ["system", "plugin"]
    }
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(500).json({ error: message });
});

if (isDev) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Skill dashboard listening on http://127.0.0.1:${config.port}`);
});

async function hasScanConsent(response: express.Response): Promise<boolean> {
  const consent = await consentStore.read();
  if (consent) {
    return true;
  }
  response.status(403).json({
    code: "SCAN_CONSENT_REQUIRED",
    error: "Local skill scanning requires explicit consent in this browser session."
  });
  return false;
}

async function scanAndMerge() {
  const [skills, state] = await Promise.all([scanSkillRoots(config.scanRoots), stateStore.read()]);
  const usage = await usageIndex.read(skills);
  return {
    scannedAt: new Date().toISOString(),
    roots: config.scanRoots,
    skills: mergeSkillState(skills, state, usage)
  };
}

function publicSkillsResponse(input: { scannedAt: string; roots: ScanRoot[]; skills: SkillView[] }) {
  return {
    scannedAt: input.scannedAt,
    roots: input.roots.map(publicScanRoot),
    skills: input.skills.map(publicSkill)
  };
}

function publicScanRoot(root: ScanRoot): ScanRoot {
  return { ...root, path: compactHomePath(root.path) };
}

function publicSkill(skill: SkillView): SkillView {
  return {
    ...skill,
    directory: compactHomePath(skill.directory),
    skillFile: compactHomePath(skill.skillFile),
    quarantinePath: skill.quarantinePath ? compactHomePath(skill.quarantinePath) : undefined
  };
}

function publicConsent<T extends { scanRoots: string[]; usageRoots: string[] }>(consent: T): T {
  return {
    ...consent,
    scanRoots: consent.scanRoots.map(compactHomePath),
    usageRoots: consent.usageRoots.map(compactHomePath)
  };
}

function publicPathResult<T extends object>(result: T): T {
  const next = Object.assign({}, result) as Record<string, unknown>;
  for (const key of ["backupPath", "destination", "path", "quarantinePath"]) {
    if (typeof next[key] === "string") {
      next[key] = compactHomePath(next[key]);
    }
  }
  return next as T;
}

function compactHomePath(value: string): string {
  const home = os.homedir();
  const normalizedValue = path.resolve(value);
  const normalizedHome = path.resolve(home);
  if (normalizedValue === normalizedHome) {
    return "~";
  }
  if (normalizedValue.startsWith(`${normalizedHome}${path.sep}`)) {
    return `~/${path.relative(normalizedHome, normalizedValue).split(path.sep).join("/")}`;
  }
  return value;
}

async function findSkill(skillId: string) {
  const skills = await scanSkillRoots(config.scanRoots);
  return skills.find((skill) => skill.id === skillId);
}

async function detectGitHubSource(skill: SkillRecord) {
  if (skill.sourceKind !== "custom") {
    return undefined;
  }

  try {
    const repoRoot = await runGit(skill.directory, ["rev-parse", "--show-toplevel"]);
    const remote = await runGit(repoRoot, ["remote", "get-url", "origin"]);
    const branch = await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const relativeDirectory = path.relative(repoRoot, skill.directory).split(path.sep).join("/") || ".";
    return sourceFromGitRemote(remote, relativeDirectory, branch === "HEAD" ? "main" : branch);
  } catch {
    return undefined;
  }
}

function sanitizeStatePatch(body: unknown): SkillUserState {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const patch: SkillUserState = {};

  if (input.lifecycle === "active" || input.lifecycle === "optimize") {
    patch.lifecycle = input.lifecycle;
  }
  if (typeof input.favorite === "boolean") {
    patch.favorite = input.favorite;
  }
  if (typeof input.notes === "string") {
    patch.notes = input.notes.slice(0, 2000);
  }
  if (typeof input.lastUsedAt === "string") {
    patch.lastUsedAt = input.lastUsedAt;
  }

  return patch;
}

function sourceInputFromRequest(body: unknown): { url: string } | { repo: string; path: string; ref?: string } {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof input.url === "string" && input.url.trim()) {
    return { url: input.url.trim() };
  }
  if (typeof input.repo === "string" && typeof input.path === "string") {
    return {
      repo: input.repo.trim(),
      path: input.path.trim(),
      ref: typeof input.ref === "string" ? input.ref.trim() : undefined
    };
  }
  throw new Error("Provide a GitHub tree URL or repo/path source.");
}

async function fetchRemoteText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!response.ok) {
    throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { timeout: 5000 });
  return stdout.trim();
}
