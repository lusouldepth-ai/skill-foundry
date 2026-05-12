# Skill Foundry

Local-first dashboard for discovering and safely maintaining Codex/agent skills.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Default Scan Roots

- `~/.codex/skills/.system`
- `~/.codex/skills`
- `~/.agents/skills`
- `~/.codex/plugins/cache`

Override roots with `SKILL_DASHBOARD_ROOTS`:

```bash
SKILL_DASHBOARD_ROOTS="custom:/path/to/skills:my-skills,plugin:/path/to/cache:plugins" npm run dev
```

## Safety

- Scanning is read-only.
- Plugin and system skills are protected and read-only.
- Custom skill edits create backups in `data/backups/`.
- Quarantine moves custom skill directories to `data/quarantine/`.
- Permanent deletion is intentionally not implemented.
- Dashboard notes and lifecycle state live in `data/skill-state.json`.

`data/` is ignored by git because it contains local machine state.
