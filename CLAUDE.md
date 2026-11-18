# Token-Plan-Harness

@AGENTS.md

上方 AGENTS.md 是本仓库的完整智能体工作指南（上手、更新流程、目录地图、安全规矩），严格遵守。

补充硬规矩：
- 提交前 `git status` 确认 `.env`、`data/` 不在暂存区；绝不提交真实密钥/token/workspace ID/账号 ID。
- 改后端必跑：`.venv/bin/python -m unittest discover -s tests -v`。
- 工作区常有未提交改动：先 `git diff`，保留不属于本次任务的修改。
