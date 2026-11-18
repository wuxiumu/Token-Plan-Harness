# AI 用量工作台（Token-Plan-Harness）

面向个人开发者与小团队的本地 AI 用量工作台：集中查看订阅配额、API 用量和本机调用记录，并提供只读局域网分享。

**当前是个人工作台原型，尚未达到公开售卖标准。** 不同平台的自动接入范围不同；不支持的配额不会伪造展示，API Key 也不等同控制台查询授权。

商业化规划入口：[docs/product/README.md](docs/product/README.md)。其中有[本地部署商业化改进总盘点](docs/COMMERCIALIZATION-LOCAL-DEPLOYMENT-REVIEW.md)，以及产品定位、套餐假设、架构、发布门槛和 17 项 AI 可执行任务。

AI 智能体 / 开发者的上手、更新流程、目录地图与安全规矩，见 [AGENTS.md](AGENTS.md)（Claude Code 会话经 [CLAUDE.md](CLAUDE.md) 自动加载同一份指南）。

```bash
python3 scripts/product_plan.py validate
python3 scripts/product_plan.py next
```

## 功能（三块）

| 模块 | 说明 |
|---|---|
| **统计概览** | 实时拉取百炼 CLI 数据：Token Plan 月度配额、Harness 权益额度、免费额度（按到期排序）、本地调用累计，含 ECharts 可视化 |
| **账号管理** | Key 增删改查；首次从 `.env` 导入默认账号，或在页面添加多个账号（明文仅存本地，前端掩码展示） |
| **模型体验** | 选 Key + 模型，走 DashScope OpenAI 兼容接口真实调用，记录每次 usage 到本地统计 |

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
    stats_service.py  # 统计（账号隔离 + 可配置缓存 + 快照落盘）
    trial_service.py  # 模型体验（DashScope OpenAI 兼容调用，记录 usage）
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

前提：Python 3.10+；百炼配额/用量模块需已安装并登录 `bl` CLI；可选 Redis（无则自动降级本地文件存储）。

```bash
# 1) 首次使用：生成本地配置并填写各平台 Key（.env 已被 gitignore，不会入库）
cp .env.example .env
# 2) 启动（自动创建 venv + 装依赖）
./run.sh
# 3) 浏览器打开
open http://127.0.0.1:8000
```

或手动：

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

> 自动配额读取依赖对应平台的授权或已登录 CLI；当前原型仍有环境相关默认配置，新设备安装需核对 `.env.example`。产品化安装引导见 ONB-001，尚未完成。

## 主要 API

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/keys` | 列出 Key（掩码） |
| POST | `/api/keys` | 新增 Key |
| PUT / DELETE | `/api/keys/{id}` | 更新 / 删除 Key |
| GET | `/api/stats/overview?force=` | 统计总览（本地累计 + 实时百炼，全局可配置缓存） |
| GET | `/api/trial/models` | 可选模型清单 |
| POST | `/api/trial/chat` | 模型体验（key_id + model + messages） |
| GET | `/api/trial/records` | 模型体验记录 |
| GET | `/api/health` | 系统状态（存储模式 / 工作空间） |

统计快照保存在当前存储后端的 `stats` 命名空间；文件模式位于 `data/store/`。Redis 与文件目前不会自动迁移，商业化迁移方案见 DATA-001。

### Codex 订阅额度

配额页中的「Codex」读取运行工作台的同一用户已登录的 Codex CLI，通过 `codex app-server` 查询账户限额窗口。需安装 Codex CLI、登录支持额度查询的账户并可访问服务；显示由服务返回的已用百分比和重置时间，无法读取时会显示错误，不将缺失数据当作零。此数据不是 OpenAI API 账单或所有历史 token 用量。

顶部「缓存」设置统一控制统计、Codex、Harness 权益和 Key 列表的缓存时长，单位为分钟（0 表示不使用缓存），设置会持久保存。各模块的手动刷新会绕过缓存。Codex 刷新失败时保留并标记上一次成功的数据及更新时间。

### Grok 用量

统计概览的「Grok」区分订阅额度和开发者 API 费用。订阅额度目前需参考 Grok 网页或 App 的 Settings → Usage 手动记录，记录不会自动更新。开发者 API 通过 xAI Management API 查询最近 30 天按项目分组的美元费用；在 `.env` 配置 `XAI_TEAM_ID` 和有用量查询权限的 `XAI_MANAGEMENT_KEY` 后重启工作台。管理密钥不同于普通推理 API Key，请勿粘贴到聊天中。查询走全局缓存，手动刷新绕过缓存；失败时标记上次成功的数据。结果截断时会提示金额不完整。

### Gemini 网页版用量

统计概览的「Gemini」提供 Google AI Pro 权益介绍和官方动态。手动额度记录暂时隐藏，已保存的数据保留在存储中。

### Kimi 会员额度

「统计概览 → 配额」中的 Kimi 卡片通过已登录的 Kimi Code CLI 本地服务读取会员月度和 Code 限额，沿用全局缓存。配额页面打开时每分钟检查缓存，超过全局缓存时长后重新读取；全局缓存为 0 时每分钟读取。每个账号卡片右上角可单独强制刷新。CLI 安装在 `data/kimi-cli/`，使用该目录下的 `node_modules/.bin/kimi login` 登录。需要同一会员账户、可用的网络和本机回环接口；工作台按需启动本地服务，令牌只在本机使用。赠送额度未在接口中确认，不会推测显示。

### 百炼多账号

工作台支持独立的百炼主账号与次级账号。概览和配额首卡显示主账号，备用账号在配额页「其他账号 → 查看更多」中展开，支持单独刷新和按全局缓存时间自动更新。

账号绑定记录保存在本机存储的 `bailian_account` 命名空间，CLI 凭证分别保存在被 Git 忽略的 `data/bailian-accounts/<key-id>/config.json`（目录 0700、文件 0600）。切换账号或重新授权不会复用其他账号的缓存；不修改全局 `~/.bailian/config.json`。配额查询需要对应账号的 Console 授权。仅有 API Key 且无控制台访问权限的账号显示「官方配额暂不可查询」，仅统计本工作台发起的调用；可登录控制台的账号会显示独立登录命令。请登录与该 Key 对应的账号，完成后点击卡片右上角刷新。

验证账号隔离：`.venv/bin/python -m unittest discover -s tests -v`。

### 启动、暂停、重启与局域网分享

在项目目录运行：

```bash
./run.sh start    # 后台启动（直接 ./run.sh 也可以）
./run.sh pause    # 暂停网站服务，保留全部数据；stop 同义
./run.sh restart  # 重启服务
./run.sh status   # 查看运行状态
```

服务监听 `0.0.0.0:8000`，日志位于 `data/runtime/server.log`，PID 信息位于 `data/runtime/server.json`。启动脚本不会杀死占用端口的其他进程。修改端口可用 `TPH_PORT=8002 ./run.sh start`；重启默认沿用正在运行的服务端口。暂停期间分享链接暂不可访问，重新启动后恢复。

在本机以 `http://127.0.0.1:8000` 打开工作台，点击顶部「分享」，复制局域网链接或扫码。二维码由本机生成。多个网卡时选择当前 Wi-Fi/有线网络地址；接收设备需在同一局域网，电脑需保持运行，并允许防火墙入站连接。路由器的访客网络/客户端隔离可能阻止访问，IP 变化后需重新分享。

分享页 `/share` 每分钟读取本机缓存快照，不查询云端、不显示个人百炼次级账号、密钥或模型调用入口。数据过期会标记待更新；本机管理员在原工作台刷新后，分享页会同步。来自非回环地址的请求只能读取分享页和脱敏数据接口，管理接口拒绝访问。请使用启动脚本（关闭代理头信任），勿额外配置可伪装为回环客户端的反向代理。

### 多账号与自由布局首页（2026-11-04）

- 默认从 `.env` / 环境变量一次性初始化；没有配置时直接在「账号管理 → 添加账号」填写。支持同平台任意多个账号。
- 同一变量增加 `_2`、`_3` 等编号可初始化多个账号，例如 `OPENAI_API_KEY_2`；可用 `OPENAI_API_KEY_2_NAME` 设置名称。详见 `.env.example`。
- 页面保存的配置优先：重启不覆盖修改，已删除的初始化账号不再自动导入。后续换 Key 在页面编辑，不需要改 `.env`。不再自动读取其他 CLI 的凭证作为新账号导入。
- 编辑 Key 留空表示保留原密钥；到期时间、手工百分比和重置时间可清空。账号改用新的百炼 Key/工作空间时，独立控制台授权失效，避免串账号。
- 百炼 Token Plan 账号支持独立授权后查询；智谱 Code Plan 账号使用各自 Key 独立缓存；xAI 管理账号填写管理密钥及团队 ID 查询 API 费用。
- Codex/Kimi 本机登录模块仍各自读取本机当前登录；其他会员账号可以创建「会员 · 手工记录」，不冒充自动同步。Gemini/Claude 等也可创建多个手工会员记录。API Key 账号的本地统计只涵盖本工作台调用。
- 首页使用独立模块布局：「编辑首页」勾选账号，拖动卡片左上角手柄排序，也支持上下箭头（键盘/手机）。布局保存在本地存储，刷新、重启后保持；全部取消会显示添加模块引导。
- 当前展示个人百炼主账号、已配置的智谱 Code Plan、本机 Codex/Kimi；公司账号设为「仅模型体验」，不在首页模块和配额账号中显示；仍可在模型体验中选择调用。每个账号卡片支持编辑和独立刷新。账号管理 → 编辑 → 更多设置中的「展示位置」可调整为仅模型体验。
- 配额页恢复百炼、智谱、Codex、Kimi 汇总卡片及详情轮播，与首页自定义布局独立；备用百炼账号在「其他账号」中展开查看。
- 局域网分享保持独立的只读投影，不因在个人首页勾选账号而扩大分享范围。
