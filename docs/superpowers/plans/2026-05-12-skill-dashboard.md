# Skill Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first skill management dashboard that scans local skill roots and presents a safe, industrial-grade management UI.

**Architecture:** Core behavior lives in tested TypeScript modules for scanning, state persistence, and quarantine safety. A small Express API serves those modules to a React/Vite frontend.

**Tech Stack:** Node 22, TypeScript, Vitest, Express, Vite, React.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`

- [ ] Add scripts for `dev`, `build`, `test`, and `start`.
- [ ] Install dependencies for React, Vite, Express, TypeScript, Vitest, and frontend build tooling.

### Task 2: Tested Skill Scanner

**Files:**
- Create: `src/core/skillScanner.ts`
- Create: `src/core/skillScanner.test.ts`

- [ ] Write tests for front matter parsing, recursive `SKILL.md` discovery, source classification, and missing-description detection.
- [ ] Verify scanner tests fail before implementation.
- [ ] Implement scanner.
- [ ] Verify scanner tests pass.

### Task 3: Tested State And Safety

**Files:**
- Create: `src/core/stateStore.ts`
- Create: `src/core/stateStore.test.ts`
- Create: `src/core/quarantine.ts`
- Create: `src/core/quarantine.test.ts`

- [ ] Write tests for merging dashboard state with scanned skills.
- [ ] Write tests proving quarantine only moves directories inside configured safe roots.
- [ ] Verify tests fail before implementation.
- [ ] Implement state and quarantine modules.
- [ ] Verify tests pass.

### Task 4: Local API

**Files:**
- Create: `src/server/index.ts`
- Create: `src/server/config.ts`

- [ ] Expose `GET /api/skills`, `PATCH /api/skills/:id/state`, `GET /api/skills/:id/content`, `POST /api/scan`, and `POST /api/skills/:id/quarantine`.
- [ ] Keep scan roots configurable through environment variables and safe defaults.

### Task 5: Industrial Dashboard UI

**Files:**
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/styles.css`

- [ ] Build metrics, filters, skill grid, detail drawer, settings strip, and safe action controls.
- [ ] Use a restrained industrial visual system with precise spacing, compact density, and muted status accents.

### Task 6: Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the local server and inspect the dashboard in the browser.
- [ ] Confirm the app discovers local skills and destructive controls remain guarded.
