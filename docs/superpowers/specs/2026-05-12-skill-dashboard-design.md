# Skill Dashboard Design

## Goal

Build a local-first personal skill management dashboard for discovering, reviewing, and safely maintaining Codex/agent skills across local directories.

## Product Direction

The first release is a hybrid of a catalog and lifecycle board. It prioritizes clarity, automatic discovery, and safe maintenance over irreversible automation. The dashboard should answer:

- What skills exist on this machine?
- Where is each skill installed?
- Which skills look active, stale, duplicated, custom, system-owned, or plugin-owned?
- What can be safely reviewed, edited, archived, or quarantined?

## Design Language

The interface uses restrained industrial minimalism: precise grids, quiet contrast, compact density, tactile controls, and an instrument-panel feel. It should evoke machined tools and professional operations software rather than a marketing page. The palette is graphite, warm off-white, muted steel, and small amber/cyan status accents.

## Safety Model

All destructive behavior is safe by default.

- Scanning is read-only.
- Local dashboard state is stored separately from skill source files.
- Delete means "move to quarantine" first, not permanent removal.
- Permanent deletion is not part of the first release.
- Auto-delete policies only produce cleanup candidates unless explicitly switched to quarantine mode.
- Plugin/cache skills are protected by default; custom user skills can be managed more directly.

## Discovery Model

Default scan roots:

- `~/.codex/skills`
- `~/.agents/skills`
- `~/.codex/plugins/cache`

The backend recursively finds `SKILL.md` files, parses front matter, derives metadata, and merges it with local dashboard state.

## Core Features

- Dashboard metrics: total skills, custom skills, plugin skills, stale candidates, missing descriptions.
- Search and filters by source, status, lifecycle, and risk.
- Skill cards with title, description, path, source type, last modified, size, and derived visual identity.
- Detail drawer for metadata and `SKILL.md` preview.
- Local notes, lifecycle status, favorite flag, and manual last-used marker.
- Safe quarantine action for custom skills.
- Sync button plus automatic periodic refresh.
- Settings for scan roots and stale thresholds.

## Implementation Architecture

Use a single local Node/Vite app:

- TypeScript scanner/state modules provide testable core behavior.
- Express API exposes scan, state updates, preview, and quarantine endpoints.
- React frontend renders the dashboard and calls local API endpoints.
- Local data lives under `data/` and is ignored by git.

## Explicit Non-Goals For First Release

- No remote skill marketplace.
- No automatic permanent deletion.
- No silent editing of plugin-owned skills.
- No background daemon outside the local app process.
- No claim that real Codex invocation frequency is known unless an integration log source is added later.
