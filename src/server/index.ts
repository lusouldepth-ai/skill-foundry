import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateSkillContent } from "../core/fileEditor";
import { quarantineSkill } from "../core/quarantine";
import { scanSkillRoots } from "../core/skillScanner";
import { mergeSkillState, StateStore, type SkillUserState } from "../core/stateStore";
import { allowedSkillRoots, loadConfig } from "./config";

const isDev = process.argv.includes("--dev");
const config = loadConfig();
const app = express();
const stateStore = new StateStore(config.stateFile);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/skills", async (_request, response, next) => {
  try {
    response.json(await scanAndMerge());
  } catch (error) {
    next(error);
  }
});

app.post("/api/scan", async (_request, response, next) => {
  try {
    response.json(await scanAndMerge());
  } catch (error) {
    next(error);
  }
});

app.get("/api/skills/:id/content", async (request, response, next) => {
  try {
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

    response.json({ result, skills: await scanAndMerge() });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/skills/:id/state", async (request, response, next) => {
  try {
    const patch = sanitizeStatePatch(request.body);
    await stateStore.update(request.params.id, patch);
    response.json(await scanAndMerge());
  } catch (error) {
    next(error);
  }
});

app.post("/api/skills/:id/quarantine", async (request, response, next) => {
  try {
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

    response.json({ result, skills: await scanAndMerge() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/config", (_request, response) => {
  response.json({
    roots: config.scanRoots,
    dataDir: config.dataDir,
    quarantineDir: config.quarantineDir,
    backupDir: config.backupDir,
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

async function scanAndMerge() {
  const [skills, state] = await Promise.all([scanSkillRoots(config.scanRoots), stateStore.read()]);
  return {
    scannedAt: new Date().toISOString(),
    roots: config.scanRoots,
    skills: mergeSkillState(skills, state)
  };
}

async function findSkill(skillId: string) {
  const skills = await scanSkillRoots(config.scanRoots);
  return skills.find((skill) => skill.id === skillId);
}

function sanitizeStatePatch(body: unknown): SkillUserState {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const patch: SkillUserState = {};

  if (input.lifecycle === "active" || input.lifecycle === "optimize" || input.lifecycle === "archive") {
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
