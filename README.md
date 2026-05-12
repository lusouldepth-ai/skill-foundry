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

## Idle Threshold / 闲置阈值

Idle status is not based on manual clicks. The dashboard calculates `Last activity` from the newest of:

- Codex session evidence: the local session log shows the skill's `SKILL.md` was actually opened or the assistant explicitly announced using that skill.
- File modification time: editing a skill counts as activity.
- Manual correction: **Correct use** is only a fallback for cases where automatic detection misses a real use.

闲置状态不靠你每次手动标记。看板会从下面三类时间里取最新值作为“最近活动”：

- Codex 会话证据：本地 session 记录显示该 skill 的 `SKILL.md` 被实际读取，或助手明确声明使用了该 skill。
- 文件修改时间：编辑过 skill 也算一次活动。
- 手动修正：**修正使用** 只是在自动检测漏记时用来补一笔。

By default, activity evidence is read from `~/.codex/sessions` and `~/.codex/archived_sessions`. Override with `SKILL_DASHBOARD_USAGE_ROOTS` if your Codex history lives elsewhere.

默认会从 `~/.codex/sessions` 和 `~/.codex/archived_sessions` 读取活动证据。如果你的 Codex 历史在别处，可以用 `SKILL_DASHBOARD_USAGE_ROOTS` 覆盖。

Bidirectional behavior:

- Dashboard editor -> local file: saving in the dashboard writes the selected `SKILL.md` immediately after creating a backup.
- Local file -> dashboard: editing a `SKILL.md` outside the app appears after clicking **Sync** or after the 15-second automatic scan.
- Dashboard state such as notes, favorites, lifecycle, backups, and quarantine records stays in `data/`.

双向行为：

- 看板编辑器 -> 本地文件：在看板里保存会先备份，再立即写入对应的 `SKILL.md`。
- 本地文件 -> 看板：在外部修改 `SKILL.md` 后，点击 **同步** 或等待 15 秒自动扫描即可进入看板。
- 备注、收藏、生命周期、备份、隔离记录等看板状态保存在 `data/`。

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

- Scanning is read-only until you explicitly save a file or quarantine a skill.
- Plugin and system skills can be edited from the dashboard, but the UI asks for confirmation because plugin updates may overwrite local edits.
- Skill edits create backups in `data/backups/`.
- Quarantine moves skill directories to `data/quarantine/`.
- Permanent deletion is intentionally not implemented.
- Dashboard notes and lifecycle state live in `data/skill-state.json`.

`data/` is ignored by git because it contains local machine state. This is the main privacy boundary for open-sourcing the tool.

`data/` 已被 git 忽略，因为里面是本机状态。这也是开源这个工具时保护个人 skill 信息的主要边界。
