/* CLI 说明书：Claude Code / Kimi CLI / Codex CLI 常用命令 + 免确认自动执行 + Skill 推荐
 * 数据驱动渲染：MANUAL_DATA[tabId] = { hero, note, groups:[{title, hot?, intro, items:[{label, desc, code, tag}] }] }
 * tab 支持 hash 路由：#/manual/claude */

const MANUAL_DATA = {
  claude: {
    note: "本机实测版本 v2.1.322（macOS）。参数随版本可能微调，以 <code>claude --help</code> 为准。免确认的三种姿势：<b>临时用 flag</b> → <b>持久用 settings.json</b> → <b>长期靠白名单</b>。",
    groups: [
      {
        title: "安装与启动",
        items: [
          { label: "官方安装脚本（macOS / Linux）", desc: "原生安装器，自动更新，推荐。", code: "curl -fsSL https://claude.ai/install.sh | bash" },
          { label: "npm 全局安装", desc: "需要 Node.js ≥ 18。", code: "npm install -g @anthropic-ai/claude-code" },
          { label: "版本检查", desc: "确认安装与当前版本。", code: "claude --version" },
          { label: "进入交互式会话", desc: "在当前目录启动 TUI。", code: "claude" },
          { label: "继续上次对话 / 恢复历史会话", desc: "<code>-c</code> 继续当前目录最近一次；<code>-r</code> 弹出选择器，也可 <code>claude -r &lt;session-id&gt;</code> 指定。", code: "claude -c\nclaude -r" },
          { label: "单次提问（headless）", desc: "打印结果后退出，可接管道/重定向；非交互模式不弹工作目录信任确认，只在可信目录使用。", code: 'claude -p "总结一下这个项目的未提交改动"' },
          { label: "指定模型", desc: "支持别名 sonnet / opus / fable 或完整模型名；会话内用 /model 切换。", code: "claude --model opus" },
        ],
      },
      {
        title: "免确认 · 快速开关",
        hot: true,
        intro: "解决「老是要手动确认」的三把钥匙，由松到紧按需选。",
        items: [
          { label: "① 跳过全部权限检查", desc: "最粗暴：所有工具直接执行、零弹窗。官方建议只在<b>无外网的沙箱</b>里用；日常项目慎用，配合 git 便于回滚审查。", code: "claude --dangerously-skip-permissions" },
          { label: "② 自动接受文件编辑", desc: "Edit/Write 不再确认，Bash 等仍按规则询问——日常开发最稳档。", code: "claude --permission-mode acceptEdits" },
          { label: "permission-mode 全部档位", desc: "<code>manual</code> 默认逐项确认 · <code>acceptEdits</code> 自动过编辑 · <code>auto</code> 自动模式 · <code>plan</code> 只读规划不执行 · <code>bypassPermissions</code> 全跳过 · <code>dontAsk</code> 不弹问（该问的直接拒绝）。", code: 'claude --permission-mode <manual|acceptEdits|auto|plan|bypassPermissions|dontAsk>' },
          { label: "③ 会话内随时切换", desc: "按 <code>Shift+Tab</code> 在 plan / 自动接受编辑 / 要求确认等模式间循环，不用重启进程；状态栏实时显示当前模式。", code: "Shift + Tab" },
          { label: "持久化默认模式", desc: "写进 <code>~/.claude/settings.json</code> 全局生效；项目级写 <code>.claude/settings.json</code>。", code: '{\n  "permissions": {\n    "defaultMode": "acceptEdits"\n  }\n}' },
        ],
      },
      {
        title: "免确认 · 精准白名单（推荐长期方案）",
        hot: true,
        intro: "把高频安全命令写进 allow，其余保持确认——比一键跳过安全得多，弹窗也随之消失。",
        items: [
          { label: "settings.json 权限规则", desc: "匹配顺序 <code>deny &gt; ask &gt; allow</code>。语法 <code>Tool(pattern)</code> 支持通配：<code>npm run test:*</code> 前缀匹配、<code>git *</code> 任意参数、<code>src/**</code> 路径通配。", code: '{\n  "permissions": {\n    "allow": [\n      "Bash(npm run test:*)",\n      "Bash(git *)",\n      "Read(./**)",\n      "Edit(src/**)"\n    ],\n    "ask":  ["Bash(git push *)"],\n    "deny": ["Bash(rm -rf *)", "Read(./.env)"]\n  }\n}' },
          { label: "三层配置文件", desc: "优先级：命令行参数 &gt; settings.local.json &gt; 项目 settings.json &gt; 全局 settings.json。", code: "~/.claude/settings.json        # 个人全局\n.claude/settings.json          # 项目级（随仓库共享给团队）\n.claude/settings.local.json    # 本机私有，加入 .gitignore" },
          { label: "单会话工具白名单", desc: "headless 任务只开放用到的工具；<code>--disallowedTools</code> 反向排除。", code: 'claude -p "修复 lint 并跑测试" \\\n  --permission-mode acceptEdits \\\n  --allowedTools "Read" "Write" "Bash(npm *)"' },
          { label: "权限管理面板", desc: "会话内查看所有生效规则及其来源文件，可直接增删。弹窗出现时选「Always allow」也会自动写入 allow 规则。", code: "/permissions" },
          { label: "一键把历史高频命令做成白名单", desc: "扫描你过往会话里的只读命令调用，按出现频率生成 allow 清单写入项目权限——治「弹到烦」的特效药。", code: "/fewer-permission-prompts" },
          { label: "Hooks 自动批准（进阶）", desc: "PreToolUse 钩子可按命令内容自动放行/拦截，比通配符更精细（如需按分支名区分只读与写操作）。会话内 <code>/hooks</code> 可视化配置。", code: "/hooks" },
          { label: "开放额外目录", desc: "让 Claude 能读写 cwd 之外的目录，免去跨目录操作反复确认。", code: "claude --add-dir ../shared-lib --add-dir ../docs" },
        ],
      },
      {
        title: "Headless / 脚本化自动化",
        items: [
          { label: "单次 JSON 结果", desc: "结构化返回，便于脚本取值。", code: 'claude -p "列出 src 下所有 TODO" --output-format json' },
          { label: "流式 JSON 事件", desc: "每个工具调用/消息逐条输出 NDJSON，配 <code>--verbose</code>；<code>--input-format stream-json</code> 可从 stdin 持续喂消息做双向编排。", code: 'claude -p "重构 src/utils" --output-format stream-json --verbose' },
          { label: "花费上限", desc: "本次 -p 任务 API 开销超过 $2 即停止，无人值守兜底。", code: 'claude -p "补全单元测试" --max-budget-usd 2' },
          { label: "结构化输出校验", desc: "按 JSON Schema 强制输出格式，配合 jq 直接消费。", code: 'claude -p "提取版本号" --json-schema \'{"type":"object","properties":{"version":{"type":"string"}},"required":["version"]}\' --output-format json' },
          { label: "后台任务", desc: "立刻返回会话 id，不占当前终端；<code>claude logs &lt;id&gt;</code> 看进度、<code>claude attach &lt;id&gt;</code> 接管、<code>claude stop &lt;id&gt;</code> 停止、<code>claude agents</code> 列出。", code: 'claude --bg "跑全量测试并修复失败项"' },
          { label: "定时循环任务", desc: "会话内把某个提示词按间隔反复执行（轮询构建、盯 PR 等）。", code: "/loop 5m /code-review" },
        ],
      },
      {
        title: "常用斜杠命令（会话内）",
        items: [
          { label: "/help", desc: "命令与快捷键总览", code: "/help" },
          { label: "/clear", desc: "彻底清空当前上下文，开始新话题", code: "/clear" },
          { label: "/compact [说明]", desc: "把前文压缩成摘要保留要点，上下文过长时用", code: "/compact 保留测试相关决定" },
          { label: "/cost", desc: "本会话 token 用量与估算成本", code: "/cost" },
          { label: "/config", desc: "主题、模型、自动更新等设置面板", code: "/config" },
          { label: "/model", desc: "查看/切换当前模型", code: "/model" },
          { label: "/rewind", desc: "回滚代码与对话到之前某个检查点", code: "/rewind" },
          { label: "/init", desc: "扫描项目生成 CLAUDE.md 项目说明书", code: "/init" },
          { label: "/mcp", desc: "查看与管理 MCP servers", code: "/mcp" },
          { label: "/agents", desc: "创建/编辑子代理（subagent）", code: "/agents" },
          { label: "/plugin", desc: "插件与技能市场管理", code: "/plugin" },
          { label: "/doctor", desc: "体检安装与环境问题", code: "/doctor" },
        ],
      },
    ],
  },
  kimi: {
    note: "本机实测 Kimi Code CLI v2.4.1。注意：旧 Python 版 <code>kimi-cli</code>（MoonshotAI/kimi-cli）<b>已归档停维</b>，后继为 Kimi Code CLI（<code>MoonshotAI/kimi-code</code>，命令仍叫 <code>kimi</code>，数据目录 <code>~/.kimi-code/</code>）。旧数据可 <code>kimi migrate</code> 迁移，但登录凭据需重新 <code>/login</code>。来源：<a href=\"https://moonshotai.github.io/kimi-code/zh/\" target=\"_blank\" rel=\"noopener\">官方文档</a>。",
    groups: [
      {
        title: "安装 · 登录 · 配置",
        items: [
          { label: "macOS / Linux 官方脚本", desc: "推荐，无需预装 Node.js。", code: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash" },
          { label: "npm 全局安装", desc: "需 Node.js ≥ 22.19；Windows 用 PowerShell：<code>irm https://code.kimi.com/kimi-code/install.ps1 | iex</code>。", code: "npm install -g @moonshot-ai/kimi-code" },
          { label: "升级 / 自检", desc: "<code>doctor</code> 只校验 config.toml / tui.toml，不启动 TUI。", code: "kimi upgrade\nkimi doctor" },
          { label: "登录", desc: "免交互设备码授权；或进 TUI 后 <code>/login</code> 选 Kimi Code OAuth / Platform API Key（platform.kimi.com）。", code: "kimi login" },
          { label: "API Key 直连写法", desc: "密钥必须写进 <code>~/.kimi-code/config.toml</code>——<code>export KIMI_API_KEY</code> 不会自动生效；也可 <code>api_key_env</code> 显式指向环境变量。数据目录可用 <code>KIMI_CODE_HOME</code> 覆盖。", code: '# ~/.kimi-code/config.toml\n[providers.kimi]\ntype = "kimi"\napi_key = "sk-xxxxx"\n\n[models.kimi-main]\nprovider = "kimi"\nmodel = "kimi-for-coding"\nmax_context_size = 262144\n\ndefault_model = "kimi-main"' },
        ],
      },
      {
        title: "启动与会话",
        items: [
          { label: "交互式会话", desc: "在项目目录启动 TUI。", code: "kimi" },
          { label: "非交互单次执行（print）", desc: "跑完输出到 stdout 即退出；此模式固定自动权限（静态 deny 规则仍生效），不能再加 <code>--yolo/--auto/--plan</code>。", code: 'kimi -p "总结当前仓库状态"' },
          { label: "脚本化 JSON 输出", desc: "每行一个 JSON，适合管道消费。", code: 'kimi -p "列出改动文件" --output-format stream-json' },
          { label: "继续 / 恢复会话", desc: "<code>-c</code> 接上当前目录最近一次；<code>-S</code> 弹选择器，<code>-S &lt;id&gt;</code> 直达指定会话。", code: "kimi -c\nkimi -S" },
          { label: "临时指定模型 / Plan 模式 / 附加目录", code: 'kimi -m kimi-code/kimi-for-coding -p "解释最新 diff"\nkimi --plan\nkimi --add-dir ../shared-lib' },
          { label: "其他实用子命令", desc: "<code>web</code> 本地 Web UI；<code>acp</code> 给 Zed/JetBrains 接线；<code>export</code> 打包会话 ZIP；<code>fork</code> 分叉会话；<code>import-sessions</code> 导入 Claude Code / Codex 历史。", code: "kimi web\nkimi acp\nkimi export -y\nkimi import-sessions" },
        ],
      },
      {
        title: "免确认 · 三档权限模式",
        hot: true,
        intro: "manual（默认，逐项问）→ <b>yolo</b>（常规自动、敏感仍问）→ <b>auto</b>（完全无人值守）。要「不弹窗但留最后一道闸」就选 yolo。",
        items: [
          { label: "① YOLO：Ask When Needed", desc: "普通改文件/跑命令自动批准；<code>.env</code>、私钥、<code>rm -rf</code> 等敏感操作、提问、Plan 退出仍会问。", code: "kimi --yolo    # 或 kimi -y" },
          { label: "② Auto：Never Ask", desc: "完全自动决策执行，连危险命令也不拦；唯一例外是 Plan 模式的计划仍等你审。", code: "kimi --auto" },
          { label: "③ 非交互天然免确认", desc: "<code>-p</code> 按 auto 策略直接跑完，无人值守脚本首选。", code: 'kimi -p "批量修复 TODO 注释"' },
          { label: "会话内随时切换", desc: "<code>/yolo</code>、<code>/auto</code>、<code>/permission</code>（选择器）；<code>Shift+Tab</code> 切 Plan 模式。", code: "/yolo\n/auto\n/permission" },
          { label: "持久化 + 静态规则", desc: "写 <code>~/.kimi-code/config.toml</code>；规则优先级 <code>deny &gt; ask &gt; allow</code>；<code>require_trust = false</code> 关掉首次进目录的信任确认（连项目级 MCP 都会自动加载，慎用）；CI 里可用环境变量 <code>KIMI_CODE_TRUST_WORKSPACE=1</code> 只信任当前工作区。", code: 'default_permission_mode = "yolo"   # "manual" | "yolo" | "auto"\n\n[[permission.rules]]\ndecision = "allow"\npattern = "Read"\n\n[[permission.rules]]\ndecision = "deny"\npattern = "Bash(rm -rf*)"\n\n[workspace]\nrequire_trust = false' },
          { label: "旧版（已停维）对照", desc: "老 Python 版写法不同：<code>-y/--afk</code>、config 里 <code>default_yolo = true</code>（布尔）、<code>~/.kimi/</code> 目录。迁移后不再适用。", code: "kimi migrate   # 从旧 kimi-cli 迁移配置/会话（凭据不迁移）" },
        ],
      },
      {
        title: "常用斜杠命令（会话内）",
        items: [
          { label: "/model · /secondary-model", desc: "切主模型 / 设子代理模型。", code: "/model" },
          { label: "/new · /sessions · /fork", desc: "开新会话（别名 /clear）/ 会话列表恢复 / 分叉当前会话。", code: "/new\n/sessions\n/fork" },
          { label: "/compact [说明]", desc: "压缩上下文，可指定保留重点。", code: "/compact 保留部署相关结论" },
          { label: "/undo [n]", desc: "撤销最近 n 条提示词（不回滚代码改动）。", code: "/undo" },
          { label: "/goal 目标", desc: "目标模式：多轮自动续跑直到完成；<code>/goal status|pause|resume|cancel</code> 控制。", code: "/goal 把测试全部跑绿" },
          { label: "/init", desc: "分析项目生成 AGENTS.md。", code: "/init" },
          { label: "/plan · /reload", desc: "开关 Plan 模式；改完 config.toml 后 /reload 免重启生效。", code: "/plan on\n/reload" },
          { label: "/usage · /status · /help", desc: "用量、当前状态、帮助。", code: "/usage" },
        ],
      },
      {
        title: "MCP / Skills / 插件扩展",
        items: [
          { label: "MCP 配置文件", desc: "用户级 <code>~/.kimi-code/mcp.json</code>，项目级 <code>&lt;repo&gt;/.kimi-code/mcp.json</code>（同名覆盖）；TUI 内 <code>/mcp-config</code> 对话式配置、<code>/mcp</code> 看连接状态。", code: '{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\n    },\n    "linear": { "url": "https://mcp.linear.app/mcp" }\n  }\n}' },
          { label: "Skills", desc: "SKILL.md 格式与 Claude Code 通用（name + description frontmatter）；目录含 <code>~/.kimi-code/skills/</code>、跨工具通用的 <code>~/.agents/skills/</code>、项目级 <code>.kimi-code/skills/</code>；调用 <code>/skill:&lt;name&gt;</code>（前缀可省）。", code: 'kimi --skills-dir ~/team-skills\n# 或 config.toml: extra_skill_dirs = ["~/team-skills"]' },
          { label: "插件市场", desc: "交互式管理器，可从任意 GitHub 仓库装 skills / MCP server。", code: "/plugins" },
          { label: "Hooks", desc: "关键节点拦截审计，如 PreToolUse 匹配 Bash。", code: '[[hooks]]\nevent = "PreToolUse"\nmatcher = "Bash"\ncommand = "python3 ~/kimi-audit.py"' },
        ],
      },
    ],
  },
  codex: {
    note: "本机实测 <b>codex-cli 0.166.0</b>，每条都对照过 <code>--help</code>。此 CLI 迭代极快：老教程里的 <code>--full-auto</code>、<code>-a untrusted</code>、<code>-a on-failure</code> <b>在当前版本已删除/报错</b>（<code>-a</code> 现仅接受 <code>on-request | never</code>）。官方文档：<a href=\"https://learn.chatgpt.com/docs/codex/cli\" target=\"_blank\" rel=\"noopener\">learn.chatgpt.com/docs/codex/cli</a>。",
    groups: [
      {
        title: "安装 · 登录 · 体检",
        items: [
          { label: "npm 全局安装", desc: "需 Node.js ≥ 18。", code: "npm install -g @openai/codex" },
          { label: "Homebrew（macOS）", desc: "注意是 cask，formula 已废弃；装过旧版先 <code>brew uninstall codex --formula</code>。", code: "brew install --cask codex" },
          { label: "升级 / 体检", desc: "<code>doctor</code> 诊断安装/配置/鉴权/网络，加 <code>--json</code> 出脱敏机器可读报告。", code: "codex update\ncodex doctor" },
          { label: "ChatGPT 账号登录", desc: "浏览器 OAuth（Plus/Pro/Team 订阅直接可用）。查身份用 <code>codex login status</code>——<b>没有</b> <code>codex status</code> 子命令。", code: "codex login\ncodex login status" },
          { label: "API Key / 无浏览器登录", desc: "stdin 读 key，不落 shell 历史；无浏览器环境用设备码。凭据存 <code>~/.codex/auth.json</code>，整个目录可用 <code>CODEX_HOME</code> 迁移。", code: "printenv OPENAI_API_KEY | codex login --with-api-key\ncodex login --device-auth" },
        ],
      },
      {
        title: "启动与会话",
        items: [
          { label: "交互 TUI", desc: "<code>-C</code> 指定工作目录、<code>-i</code> 附截图（可重复）、<code>--add-dir</code> 加额外目录。", code: 'codex "解释这个仓库的启动流程"\ncodex -C ~/code/repo -i err.png "这个报错什么意思"' },
          { label: "恢复 / 分叉会话", desc: "<code>resume</code> 默认弹选择器；<code>--last</code> 直达最近一次；<code>--all</code> 列出所有目录的会话。", code: "codex resume\ncodex resume --last\ncodex resume <SESSION_ID> \"继续补测试\"\ncodex fork --last" },
          { label: "原生联网搜索", desc: "开启内置 web_search 工具，调用不逐次弹确认。", code: 'codex --search "查一下最新 SDK 变更"' },
          { label: "代码审查", desc: "非交互审查未提交改动 / 对比 base 分支 / 指定 commit；<code>codex exec review --base main</code> 可进 CI。", code: "codex review --uncommitted\ncodex review --base main\ncodex review --commit <SHA>" },
          { label: "杂项子命令", desc: "给已有会话排队消息 / 浏览本地 agent 会话 / 看 Codex Cloud 任务并把 diff 打到本地。", code: "codex queue\ncodex agents\ncodex cloud\ncodex apply <TASK_ID>" },
        ],
      },
      {
        title: "Headless · 脚本化（codex exec）",
        items: [
          { label: "非交互跑一条", desc: "别名 <code>codex e</code>；跑完即退。prompt 也可从 stdin：echo \"总结改动\" | codex exec -", code: 'codex exec "把 README 里的安装步骤更新一下"' },
          { label: "程序化输出", desc: "<code>--json</code> 输出 JSONL 事件流；<code>-o</code> 把最终回复写进文件；<code>--output-schema</code> 按 JSON Schema 强制结构化。", code: 'codex exec --json "列出所有 TODO"\ncodex exec -o /tmp/answer.txt "总结发布风险"\ncodex exec --output-schema answer.schema.json "提取配置项"' },
          { label: "CI 常用组合", desc: "允许非 git 目录 / 不落盘会话 / 去色写日志。", code: 'codex exec --skip-git-repo-check --ephemeral --color never "检查拼写并汇报"' },
          { label: "多步流水线", desc: "非交互续跑与分叉，适合分阶段 CI。", code: 'codex exec "第一步：搭好测试骨架"\ncodex exec resume --last "第二步：补齐边界用例"' },
          { label: "剥离本地策略（慎用）", desc: "<code>--ignore-user-config</code> 不加载 config.toml（鉴权仍用）；<code>--ignore-rules</code> 不加载 .rules 执行策略。", code: 'codex exec --ignore-user-config "干净环境跑一次"' },
        ],
      },
      {
        title: "免确认 · 自动执行",
        hot: true,
        intro: "两条独立开关：<code>-a</code> 决定<b>问不问你</b>（on-request / never），<code>-s</code> 决定<b>能动手到哪</b>（read-only / workspace-write / danger-full-access）。不弹确认 ≠ 没有沙箱，组合着用才安全。",
        items: [
          { label: "① 日常推荐档", desc: "在工作区内自动干活，越界（出网、写工作区外）才弹确认。", code: "codex --sandbox workspace-write -a on-request" },
          { label: "② 全自动档（= 老 --full-auto）", desc: "workspace-write 沙箱 + 完全不弹确认。<b>--full-auto 已在 0.147 移除</b>，网上老教程直接报错，用这行替代。", code: 'codex --sandbox workspace-write --ask-for-approval never\ncodex exec --sandbox workspace-write -a never "跑测试并修失败用例"' },
          { label: "③ Approve for me", desc: "审批请求交给自动审阅 agent 代批（沙箱仍为 workspace-write），比一刀切 never 稳。", code: "codex --approve-for-me" },
          { label: "④ 彻底放开（俗称 yolo）", desc: "无确认 + 无沙箱，--help 自标 <b>EXTREMELY DANGEROUS</b>，仅限外部已隔离的容器/VM。<code>--yolo</code> 是其社区隐藏别名，help 不列出，脚本别依赖它。", code: "codex --dangerously-bypass-approvals-and-sandbox" },
          { label: "持久化默认（config.toml）", desc: "写进 <code>~/.codex/config.toml</code> 后不用每次带 flag。", code: '# ~/.codex/config.toml\nmodel = "gpt-5.1-codex"\nmodel_reasoning_effort = "medium"\napproval_policy = "on-request"      # 免确认改 "never"\nsandbox_mode = "workspace-write"\n\n[sandbox_workspace_write]\nwritable_roots = ["/tmp/scratch"]   # 额外可写根目录\nnetwork_access = false              # 沙箱内是否允许联网' },
          { label: "单次临时覆盖", desc: "<code>-c</code> 点号路径覆盖任意 config 键，值按 TOML 解析。", code: "codex -c 'approval_policy=\"never\"' -c 'sandbox_mode=\"workspace-write\"'" },
          { label: "Profile：一键切换档位", desc: "v2 profile = 叠加 <code>~/.codex/&lt;名字&gt;.config.toml</code>。坑：老的 <code>[profiles.名字]</code> 写法与 <code>-p</code> 同名会直接启动报错，把旧表迁进独立文件。", code: 'cat > ~/.codex/auto.config.toml <<\'EOF\'\napproval_policy = "never"\nsandbox_mode = "workspace-write"\nEOF\n\ncodex -p auto "把所有 console.log 换成 logger"\ncodex exec -p auto --skip-git-repo-check "跑 CI 步骤"' },
          { label: "命令前缀白名单（长期解法）", desc: "首次弹确认时选「总是允许该前缀」，规则落盘到 <code>~/.codex/rules/default.rules</code>，同类命令以后不再问。", code: "/approvals\n/permissions" },
          { label: "只放开某个目录", desc: "不降安全基线，只把临时目录纳入可写。", code: "codex -s workspace-write --add-dir /tmp/scratch -a never" },
        ],
      },
      {
        title: "常用斜杠命令（TUI 内）",
        items: [
          { label: "/status · /usage", desc: "模型、审批与沙箱策略、token 用量与上下文余量。", code: "/status" },
          { label: "/approvals · /permissions", desc: "切换审批模式与沙箱权限。", code: "/approvals" },
          { label: "/model · /compact", desc: "切模型与推理强度；压缩历史腾上下文。", code: "/model\n/compact" },
          { label: "/review · /diff · /undo", desc: "会话内发起代码审查；看当前改动 diff；撤销上一轮。", code: "/review\n/diff\n/undo" },
          { label: "/init · /mcp · /skills", desc: "生成 AGENTS.md 脚手架；管理 MCP；浏览调用 skills。", code: "/init\n/mcp\n/skills" },
          { label: "/new · /resume · /fork · /goal", desc: "新会话 / 恢复 / 分叉 / 设长任务目标。", code: "/new\n/resume\n/fork\n/goal 把迁移脚本跑完" },
          { label: "/help", desc: "命令随版本增减很快，输入 <code>/</code> 的实时弹层才是当前版本的权威清单。", code: "/help" },
        ],
      },
      {
        title: "MCP · AGENTS.md · Skills",
        items: [
          { label: "挂 MCP server", desc: "stdio 写法直接写进 config 的 <code>[mcp_servers.*]</code>；HTTP 远端 + bearer token；OAuth 型先 <code>login</code>。", code: 'codex mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /tmp\ncodex mcp add remote --url https://example.com/mcp --bearer-token-env-var MY_TOKEN\ncodex mcp list\ncodex mcp login <name>' },
          { label: "AGENTS.md 指令分层", desc: "全局 <code>~/.codex/AGENTS.md</code> → 仓库根 → 子目录逐层叠加；<code>/init</code> 生成骨架；临时指令用 <code>-c developer_instructions</code>。", code: 'codex -c \'developer_instructions="回复一律用中文"\' "评审 src 模块"' },
          { label: "Skills（与 Claude Code 同格式）", desc: "SKILL.md（YAML frontmatter：name + description）；目录 <code>~/.codex/skills/&lt;name&gt;/</code> 全局、项目 <code>.codex/skills/</code>；TUI 内 <code>/skills</code> 调用；插件走 <code>codex plugin list|add</code>。", code: "ls ~/.codex/skills" },
          { label: "把任意命令丢进沙箱", desc: "验证脚本在受限环境下行为，macOS 走 seatbelt。", code: "codex sandbox -- npm test" },
        ],
      },
    ],
  },
  skills: {
    note: "Skill = 带 <code>SKILL.md</code> 的目录，按描述自动触发（不用手动加载）；Kimi CLI 与 Codex 也支持同一套 Agent Skills 格式。目录：个人 <code>~/.claude/skills/&lt;name&gt;/SKILL.md</code>，项目级 <code>.claude/skills/&lt;name&gt;/SKILL.md</code>。",
    groups: [
      {
        title: "推荐 · 官方与高频",
        items: [
          { label: "Anthropic 官方技能仓库", desc: "含文档处理（pdf / docx / pptx / xlsx）、skill-creator、前端设计等官方示例，可直接注册为插件市场源。", code: "/plugin marketplace add anthropics/skills\n/plugin install" },
          { label: "skill-creator", desc: "官方元技能：用对话方式生成规范的 SKILL.md，写自己的 skill 从它开始。", code: "/plugin marketplace add anthropics/skills" },
          { label: "文档四件套（pdf/docx/pptx/xlsx）", desc: "读取、生成、改写 Office 与 PDF 文件，做报表和文档自动化很省事。", code: "/plugin" },
        ],
      },
      {
        title: "推荐 · 开发工作流",
        hot: false,
        items: [
          { label: "code-review", desc: "对当前 diff / PR 做多轮代码审查，报正确性 bug 与简化建议。", code: "/code-review high" },
          { label: "security-review", desc: "对分支上的待提交改动做安全审查，提交前扫一遍。", code: "/security-review" },
          { label: "simplify", desc: "审查改动代码的复用/简化/效率问题并直接修掉。", code: "/simplify" },
          { label: "fewer-permission-prompts", desc: "从历史会话提炼高频只读命令写入白名单，直击「免确认」诉求（详见 Claude Code 页）。", code: "/fewer-permission-prompts" },
          { label: "loop", desc: "把任意提示词/命令按间隔定时循环执行，盯部署盯 CI 用。", code: "/loop 10m /security-review" },
          { label: "init", desc: "为新项目生成 CLAUDE.md；配合 /memory 维护长期记忆。", code: "/init" },
          { label: "update-config（自然语言改配置）", desc: "直接说「以后 npm test 都不要问」，它会把 hooks/permissions 写进 settings.json。", code: "示例：让 Claude 修改 ~/.claude/settings.json" },
        ],
      },
      {
        title: "自己写一个 Skill",
        intro: "本质就是一份带 frontmatter 的 Markdown：name + description（写清触发场景）+ 步骤正文。",
        items: [
          { label: "最小 SKILL.md", desc: "放到 <code>~/.claude/skills/weekly-report/SKILL.md</code>，说「写周报」即自动触发。", code: "---\nname: weekly-report\ndescription: 当用户要求写周报/汇报本周工作时使用\n---\n\n1. 运行 `git log --since=\"7 days ago\" --oneline` 汇总提交\n2. 按「完成 / 进行中 / 风险」三段输出\n3. 中文，不超过 300 字" },
          { label: "目录结构", code: "~/.claude/skills/          # 个人全局\n<repo>/.claude/skills/     # 项目级，随 git 共享给团队\n  └── my-skill/\n      ├── SKILL.md         # 必需：frontmatter + 指令\n      └── references/      # 可选：长文档按需加载，省上下文" },
          { label: "百炼家族（配合本工作台）", desc: "生图/精调/知识库/MCP 等资源管理技能，官方一键安装。", code: "bl skill init" },
        ],
      },
    ],
  },
};

/* 复制按钮：clipboard API 在 http 局域网页面不可用时回退 execCommand */
async function manualCopy(text, btn) {
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; }
  } catch (_) {}
  if (!ok) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      ok = document.execCommand("copy"); ta.remove();
    } catch (_) {}
  }
  btn.textContent = ok ? "已复制 ✓" : "复制失败";
  btn.classList.toggle("copied", ok);
  setTimeout(() => { btn.textContent = "复制"; btn.classList.remove("copied"); }, 1400);
}

App.Views.manual = {
  TABS: [
    { id: "claude", label: "Claude Code" },
    { id: "kimi", label: "Kimi CLI" },
    { id: "codex", label: "Codex CLI" },
    { id: "skills", label: "Skill 推荐" },
  ],
  _active: "claude",
  _rendered: null,

  setActiveTab(tab) {
    if (tab && this.TABS.some((t) => t.id === tab)) this._active = tab;
  },
  onHash(tab) { this.switchTab(tab); },

  init() {
    const hp = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (hp[1] && this.TABS.some((t) => t.id === hp[1])) this._active = hp[1];
    const el = document.getElementById("view-manual");
    this._rendered = null; // init 会重建 DOM，需要强制重新渲染内容
    el.innerHTML = `
      <div class="manual-wrap">
        <div class="manual-hero">
          <div><span>五棵松工作台 / CLI GUIDE</span><h2>CLI 说明书</h2>
          <p>Claude / Kimi / Codex 命令行常用操作，重点：如何让它们<b>不再反复弹确认</b>、自动执行。每条命令均可一键复制。</p></div>
          <span class="manual-mark">⌘</span>
        </div>
        <div id="manual-tabs" class="tabs"></div>
        <div id="manual-body"></div>
      </div>`;
    this.renderTabs();
    this.switchTab(this._active);
  },

  renderTabs() {
    const wrap = document.getElementById("manual-tabs");
    wrap.innerHTML = this.TABS.map((t) =>
      `<button class="tab-btn ${t.id === this._active ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("");
    wrap.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => this.switchTab(b.dataset.tab));
  },

  switchTab(id) {
    if (!this.TABS.some((t) => t.id === id)) id = "claude";
    this._active = id;
    const target = `#/manual/${id}`;
    if (location.hash !== target) location.hash = target;
    document.querySelectorAll("#manual-tabs .tab-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === id));
    // 点击 tab 已渲染过一次，hashchange 回调只同步高亮，避免重复渲染
    if (this._rendered === id) return;
    this._rendered = id;
    const body = document.getElementById("manual-body");
    const data = MANUAL_DATA[id];
    if (!data) { body.innerHTML = `<div class="loading">内容整理中…</div>`; return; }
    body.innerHTML = `
      ${data.note ? `<div class="manual-note">${data.note}</div>` : ""}
      ${data.groups.map((g, gi) => `
        <section class="manual-group ${g.hot ? "hot" : ""}">
          <div class="manual-group-head">
            <h3>${g.title}</h3>
            ${g.hot ? `<span class="manual-hot-tag">重点 · 免确认</span>` : ""}
            <div class="spacer"></div>
            <button class="btn ghost sm manual-copy-all" data-group="${gi}" type="button">复制本组全部</button>
          </div>
          ${g.intro ? `<p class="manual-group-intro">${g.intro}</p>` : ""}
          <div class="manual-items">${g.items.map((it, ii) => `
            <div class="cmd-item">
              <div class="cmd-head"><strong>${it.label}</strong>${it.tag ? `<span class="cmd-tag">${it.tag}</span>` : ""}</div>
              ${it.desc ? `<p class="cmd-desc">${it.desc}</p>` : ""}
              <div class="cmd-code">
                <pre><code>${fmt.esc(it.code)}</code></pre>
                <button class="copy-btn" data-tab="${id}" data-group="${gi}" data-item="${ii}" type="button">复制</button>
              </div>
            </div>`).join("")}</div>
        </section>`).join("")}`;
    body.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.onclick = () => {
        const it = MANUAL_DATA[id].groups[+btn.dataset.group].items[+btn.dataset.item];
        manualCopy(it.code, btn);
      };
    });
    body.querySelectorAll(".manual-copy-all").forEach((btn) => {
      btn.onclick = () => {
        const g = MANUAL_DATA[id].groups[+btn.dataset.group];
        manualCopy(g.items.map((it) => `# ${it.label}${it.desc ? " — " + it.desc.replace(/<[^>]+>/g, "") : "\n"}\n${it.code}`).join("\n\n"), btn);
      };
    });
  },
};
