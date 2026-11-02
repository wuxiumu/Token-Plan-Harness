# AI-Key 管理工作台（Token-Plan-Harness）

监控阿里云百炼（DashScope）API Key 的**用量 / 额度 / 到期**，并用不同模型做**多模型试画**。

## 功能（三块）

| 模块 | 说明 |
|---|---|
| **统计概览** | 实时拉取百炼 CLI 数据：Token Plan 月度配额、Harness 权益额度、免费额度（按到期排序）、本地调用累计，含 ECharts 可视化 |
| **Key 管理** | Key 增删改查；启动时自动导入 `bl` token-plan 配置里的默认 Key（明文仅存本地，前端掩码展示） |
| **多模型试画** | 选 Key + 模型，走 DashScope OpenAI 兼容接口真实调用，记录每次 usage 到本地统计 |

## 技术架构

```
backend/
  app.py              # FastAPI 入口 + 全部 API 路由
  config.py           # 全局配置（redis url / workspace / 模型清单）
  models.py           # pydantic 数据模型
  storage/            # 统一存储：redis 优先，连不上自动 fallback 文件
    base.py           #   抽象接口
    redis_store.py    #   redis 实现
    file_store.py     #   文件 JSON 实现（data/store/*.json）
  adapters/
    bailian_cli.py    # 封装 `bl ... --output json`，并行拉取用量/权益
  services/
    key_service.py    # Key 管理（含从 bl config 导入默认 Key）
    stats_service.py  # 统计（并行拉取 + 60s 缓存 + 快照落盘）
    trial_service.py  # 试画（DashScope OpenAI 兼容调用，记录 usage）
frontend/
  index.html          # 单页，三块视图 + 导航
  css/style.css
  js/
    api.js            # fetch 封装
    app.js            # 入口：导航切换 + 视图初始化
    views/            # 模块化视图：keys.js / stats.js / trial.js
    vendor/echarts.min.js  # 本地化图表库（离线可用）
```

### 存储
- 优先 **redis**（`redis://localhost:6379/0`，可用 `TPH_REDIS_URL` 覆盖）
- 无 redis 自动降级 **文件 JSON**（`data/store/*.json`）
- API Key 明文仅存本地存储（redis / data 目录），`.gitignore` 已忽略 `data/`

## 快速开始

```bash
# 1) 启动（自动创建 venv + 装依赖）
./run.sh
# 2) 浏览器打开
open http://127.0.0.1:8000
```

或手动：

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

> 数据依赖本机已配置的百炼 CLI（`bl auth login`）与默认业务空间 ``；
> 可通过环境变量 `BAILIAN_WORKSPACE_ID` 覆盖工作空间。

## 主要 API

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/keys` | 列出 Key（掩码） |
| POST | `/api/keys` | 新增 Key |
| PUT / DELETE | `/api/keys/{id}` | 更新 / 删除 Key |
| GET | `/api/stats/overview?force=` | 统计总览（本地累计 + 实时百炼，60s 缓存） |
| GET | `/api/trial/models` | 可选模型清单 |
| POST | `/api/trial/chat` | 试画（key_id + model + messages） |
| GET | `/api/trial/records` | 试画记录 |
| GET | `/api/health` | 系统状态（存储模式 / 工作空间） |

统计快照落盘：`data/stats_overview.json`。

## 当前统计快照（2026-11-02）

- **Token Plan 月度配额**：已用 65.2%，下次重置 **2026-11-03**
- **Harness 权益（official_tool）7 项**：图像生成 20 张 / 代码解释器 100 次 / 联网搜索增强 100 次 / 网页解析 1000 次 / 垂类搜索 100 次 / 语音合成 10000 字符 / 语音识别 18000 秒 —— 全部 0 使用，**到期 2026-11-04**
- **免费额度（临近到期）**：`qwen-image-3.0/-pro`(10张) 11-03、`wan3.0-video`(30s) 11-05、`deepseek-v4-pro-0813` 11-13、`qwen3.8-27b` 11-17、`glm-5.3` 11-23
- **本地累计**：1 次调用 / 222 tokens（来自试画）
