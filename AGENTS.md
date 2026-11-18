# 智能体工作指南（AGENTS.md）

给接手本仓库的 AI 智能体 / 开发者：按本文即可上手使用、修改并更新本项目。人类读者可只看 [README.md](README.md)，本文偏操作与规矩。

## 这是什么

AI 用量工作台（Token-Plan-Harness）：本地运行的 FastAPI + 原生 JS 单页应用，聚合百炼 / 智谱 / OpenAI / Codex / Kimi / Grok 等平台的配额、用量与模型体验，支持局域网只读分享。个人工作台原型，未达公开售卖标准。

## 快速上手

```bash
cp .env.example .env      # 首次使用：填写各平台 Key（见下文安全规矩）
./run.sh start            # 后台启动（自动建 venv 装依赖；stop/pause/restart/status 同理）
open http://127.0.0.1:8000
```

- 依赖：Python 3.10+；`bl`（百炼 CLI，配额/用量模块必需）；可选 Codex / Kimi CLI（对应模块）；可选 Redis（无则自动降级文件存储 `data/store/`）。
- 端口：默认 8000，`TPH_PORT=8002 ./run.sh start` 可改。
- 测试：`.venv/bin/python -m unittest discover -s tests -v`（改动后端后必须跑）。

## 目录地图

```
backend/app.py            全部 API 路由（单文件，路由集中在这）
backend/config.py         环境变量与 Provider 注册表 PROVIDERS
backend/services/*.py     各业务模块（统计/Key/试用/分享/多账号…）
backend/adapters/         外部 CLI 封装（bl 命令）
backend/storage/          redis 优先、文件 JSON 兜底的统一存储
frontend/                 原生 JS 单页：js/views/ 按页面模块拆分
docs/product/             商业化规划：PRODUCT/ARCHITECTURE/READINESS/EXECUTION/backlog.json
scripts/product_plan.py   任务计划工具：validate / next / show <ID>
scripts/workbench.py      服务启动与进程管理（run.sh 实际调用它）
tests/                    unittest 测试（账号隔离、分享、配额等）
```

## 怎么更新（标准流程）

1. 读 `docs/product/README.md` 与 `docs/product/EXECUTION.md`（AI 执行协议）。
2. `python3 scripts/product_plan.py validate` 确认计划完整。
3. `python3 scripts/product_plan.py next` 取下一项依赖已满足的任务，按任务内的范围、验收标准与验证命令实施。
4. 改后端跑 unittest；改前端手工冒烟（`./run.sh restart` 后打开页面）。
5. 仅在验收证据充分时更新 `backlog.json` 中任务状态；不要把规划写成已上线功能。
6. 提交：中文提交信息，说明改了什么、为什么；一个提交一件事。

不做的事：不执行 backlog 里的命令自动部署；不消费真实模型额度做测试；不上传用户数据。

## 安全与密钥规矩（最重要）

- **永远不提交**：`.env`、`data/`（含 API Key 明文、百炼账号凭证、运行日志）、`.venv/`、`*.log`。`.gitignore` 已覆盖，改动提交前用 `git status` 复核。
- 代码中**不写任何真实密钥、token、workspace ID、账号 ID**。配置一律 `os.environ.get("XXX", "")`，空默认值；真实值放 `.env`（本地）。
- `.env.example` 只放占位符和注释，不复制 `.env` 的真实值。
- 前端展示密钥必须掩码；分享页 `/share` 保持只读、脱敏，不新增密钥或次级账号出口。
- 测试用假 Key（如 `sk-test-...`）或 monkeypatch 环境变量，不读用户 `.env`。

## 排障速查

- 配额显示异常 / 数据旧：顶栏「缓存」设 0 或点模块右上角强制刷新（绕过缓存）。
- 百炼查询失败：`bl auth status` 检查 CLI 登录；`llm-` 开头的 workspace 需在 `.env` 配置。
- 分享页打不开：确认同一局域网、防火墙放行 8000、服务 `./run.sh status` 在跑。
- 存储模式：`GET /api/health` 返回当前 redis/文件状态。
