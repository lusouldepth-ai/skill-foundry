# Skill Foundry / Skill 管理

Local-first dashboard for discovering and safely maintaining Codex/agent skills. It scans local skill folders only after explicit consent, then lets you review, search, edit with backups, track idle skills, clean duplicates, quarantine unwanted copies, and bind GitHub sources for conservative updates.

本地优先的 skill 管理看板。它必须先获得明确授权，才会扫描本机 skill 目录；之后可以查看、搜索、备份编辑、识别闲置、清理重复、隔离多余副本，并为 GitHub 来源的 skill 绑定保守更新流程。

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

打开 `http://127.0.0.1:5173`。

On first run, the app shows a local scan consent screen before reading any skill folders.

首次运行时，页面会先显示本地扫描授权界面；未同意前不会读取任何 skill 目录。

## Privacy Model / 隐私模型

Skill Foundry is designed as a local-only tool:

- The server binds to `127.0.0.1`.
- The app asks for consent before scanning local skill roots or Codex session paths.
- `data/` contains local state, notes, backups, quarantine files, GitHub source bindings, and the scan consent record. It is ignored by git.
- Sync means "rescan local folders"; it does not upload, publish, or commit skill content.
- GitHub update checks fetch remote `SKILL.md` files only for skills whose source you bind or whose custom git repo can be inferred.

Skill Foundry 的隐私边界：

- 服务只绑定到 `127.0.0.1`。
- 扫描本机 skill 目录或 Codex 会话路径前，必须先获得授权。
- `data/` 保存本地状态、备注、备份、隔离文件、GitHub 来源绑定和扫描授权记录；该目录被 git 忽略。
- 同步只表示“重新扫描本地目录”，不会上传、公开或提交 skill 内容。
- GitHub 更新检查只会读取你绑定来源的远端 `SKILL.md`，或能从自定义 skill 所在 git 仓库推断出的来源。

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

## Duplicate Cleanup / 重复清理

Duplicate cleanup is intentionally reversible. The dashboard groups skills by normalized skill name, keeps the safest copy visible, and moves extra copies directly to `data/quarantine/`.

重复清理是可逆的。看板会按规范化后的 skill 名称归组，保留最安全的一个副本，并把多余副本直接移动到 `data/quarantine/`。

Keeper priority:

- Active or optimize lifecycle beats quarantined lifecycle.
- Favorited skills beat non-favorited skills.
- Custom/manageable roots beat protected plugin/system roots.
- Newer detected activity then newer file modification breaks ties.

保留优先级：

- 活跃或待优化优先于已隔离。
- 收藏优先于未收藏。
- 自定义/可管理目录优先于受保护的插件/系统目录。
- 之后再用最近活动时间和文件修改时间打破平局。

The **Clean duplicates** action moves only the dashboard-recommended extra copies out of scan roots. They stop contributing to totals immediately, but the original folders remain recoverable in `data/quarantine/`.

**清理重复** 只会移动看板推荐的多余副本。它们会立刻离开扫描总数，但原始文件夹仍保留在 `data/quarantine/`，可以恢复。

There is no separate archive step in the UI. The simpler model is: review duplicate groups, then quarantine extras if you agree.

页面里不再单独设置“归档”步骤。简化后的模型是：先查看重复组，确认后把多余副本移入隔离区。

## GitHub Updates / GitHub 更新

The dashboard supports a conservative update flow for GitHub-sourced custom skills:

- If a skill lives inside a local git repository with a GitHub `origin`, the dashboard can infer its repo, branch, and path.
- If a skill was copied or installed without git metadata, bind its GitHub tree URL once in the detail drawer.
- **Check update** compares remote `SKILL.md` with the local file.
- **Apply update** backs up the local `SKILL.md` before writing the remote version.
- If the local file changed after source binding, the dashboard blocks overwrite and asks for manual review.
- Plugin and system skills are provider-managed. Update the plugin/provider first, then use **Sync** here.

看板对来自 GitHub 的自定义 skill 提供保守更新流程：

- 如果 skill 本身位于带 GitHub `origin` 的本地 git 仓库中，看板可以推断 repo、branch 和路径。
- 如果 skill 是复制或安装进来的、没有 git 元数据，需要在详情区绑定一次 GitHub tree URL。
- **检查更新** 会比较远端 `SKILL.md` 和本地文件。
- **执行更新** 会先备份本地 `SKILL.md`，再写入远端版本。
- 如果绑定来源后本地文件又被改过，看板会阻止覆盖，要求人工检查。
- 插件和系统 skill 由来源提供方管理。先更新插件/提供方，再在这里 **同步**。

When someone else clones this project from GitHub:

1. They run `npm install`.
2. They run `npm run dev`.
3. They open `http://127.0.0.1:5173` and approve the local scan consent screen.
4. The app scans only their own local skill roots, such as `~/.codex/skills`.
5. Their notes/backups/quarantine state stays in their local `data/` folder.

别人从 GitHub clone 这个工具时：

1. 运行 `npm install`。
2. 运行 `npm run dev`。
3. 打开 `http://127.0.0.1:5173`，并在页面上同意本地扫描授权。
4. 工具只会扫描他们自己电脑上的 skill 目录，例如 `~/.codex/skills`。
5. 他们的备注、备份、隔离状态只保存在自己的本地 `data/` 目录。

## Safety

- Scanning is read-only until you explicitly save a file or quarantine a skill.
- Scan endpoints return `SCAN_CONSENT_REQUIRED` until local scan consent is granted.
- Plugin and system skills can be edited from the dashboard, but the UI asks for confirmation because plugin updates may overwrite local edits.
- Skill edits create backups in `data/backups/`.
- Quarantine moves skill directories to `data/quarantine/`.
- Permanent deletion is intentionally not implemented.
- Dashboard notes and lifecycle state live in `data/skill-state.json`; scan consent lives in `data/scan-consent.json`.

`data/` is ignored by git because it contains local machine state. This is the main privacy boundary for open-sourcing the tool.

`data/` 已被 git 忽略，因为里面是本机状态。这也是开源这个工具时保护个人 skill 信息的主要边界。
