# Privacy / 隐私说明

Skill Foundry is a local-first skill dashboard. It is meant to run on your own machine and inspect your own local skill folders only after consent.

Skill Foundry 是本地优先的 skill 管理看板。它只应在你自己的电脑上运行，并且只有在你同意后才读取本机 skill 目录。

## What Stays Local

- Skill names, descriptions, paths, notes, and file previews.
- Backups created before editing `SKILL.md`.
- Quarantined skill folders.
- GitHub source bindings for update checks.
- The local scan consent record.

These files live under `data/`, and `data/` is intentionally ignored by git.

## What The App Does Not Do

- It does not upload local skill content.
- It does not send scan results to a hosted service.
- It does not commit or push your `data/` directory.
- It does not permanently delete skills.

## First-Run Consent

On first run, the UI asks before scanning default roots such as `~/.codex/skills`, `~/.agents/skills`, and plugin cache folders. The backend also blocks scan-related API calls until consent is saved locally in `data/scan-consent.json`.

首次运行时，页面会先询问是否允许扫描默认目录，例如 `~/.codex/skills`、`~/.agents/skills` 和插件缓存目录。后端也会在 `data/scan-consent.json` 写入本地授权前阻止扫描类 API。

## Open-Source Safety Checklist

Before publishing or contributing:

- Confirm `git status --ignored --short data` shows `data/` as ignored.
- Do not commit screenshots that reveal local skill paths or private skill content.
- Do not commit `.env` files.
- Review `git diff --cached` before pushing.
