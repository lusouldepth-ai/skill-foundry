# Skill Foundry / Skill 管理

Local-first dashboard for discovering and safely maintaining Codex/agent skills.

本地优先的 skill 管理看板，用来扫描、查看、标记、编辑和安全隔离 Codex/agent skills。

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

打开 `http://127.0.0.1:5173`。

## Default Scan Roots

- `~/.codex/skills/.system`
- `~/.codex/skills`
- `~/.agents/skills`
- `~/.codex/plugins/cache`

Override roots with `SKILL_DASHBOARD_ROOTS`:

```bash
SKILL_DASHBOARD_ROOTS="custom:/path/to/skills:my-skills,plugin:/path/to/cache:plugins" npm run dev
```

## Sync Model / 同步机制

The **Sync** button rescans local folders. It does not upload, download, or commit skill content.

“同步”按钮只会重新扫描本机目录，不会上传、下载或提交任何 skill 内容。

When someone else clones this project from GitHub:

1. They run `npm install`.
2. They run `npm run dev`.
3. The app scans their own local skill roots, such as `~/.codex/skills`.
4. Their notes/backups/quarantine state stays in their local `data/` folder.

别人从 GitHub clone 这个工具时：

1. 运行 `npm install`。
2. 运行 `npm run dev`。
3. 工具会扫描他们自己电脑上的 skill 目录，例如 `~/.codex/skills`。
4. 他们的备注、备份、隔离状态只保存在自己的本地 `data/` 目录。

## Safety

- Scanning is read-only.
- Plugin and system skills are protected and read-only.
- Custom skill edits create backups in `data/backups/`.
- Quarantine moves custom skill directories to `data/quarantine/`.
- Permanent deletion is intentionally not implemented.
- Dashboard notes and lifecycle state live in `data/skill-state.json`.

`data/` is ignored by git because it contains local machine state. This is the main privacy boundary for open-sourcing the tool.

`data/` 已被 git 忽略，因为里面是本机状态。这也是开源这个工具时保护个人 skill 信息的主要边界。
