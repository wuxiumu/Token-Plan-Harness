/* 统计概览视图（多 tab：概览 / TokenPlan / Harness / 免费额度 / 智谱 / 本地用量） */
App.Views.stats = {
  TABS: [
    { id: "overview", label: "概览" },
    { id: "tokenplan", label: "配额" },
    { id: "harness", label: "Harness 权益" },
    { id: "free", label: "免费额度" },
    { id: "local", label: "本地用量" },
    { id: "grok", label: "Grok" },
    { id: "kimi", label: "Kimi" },
    { id: "gemini", label: "Gemini" },
    { id: "gpt", label: "GPT" },
    { id: "claude", label: "Claude" },
  ],
  _data: null,
  _active: "overview",

  // 供 app.js 在 init 前恢复上次 tab（hash 路由）
  setActiveTab(tab) {
    if (tab === "codex") tab = "tokenplan";
    if (tab && this.TABS.some((t) => t.id === tab)) this._active = tab;
  },

  // 同视图内 hash 变化（#/stats/{tab}）时由 app.js 调用，只切 tab 不重拉数据
  onHash(tab) {
    this.switchTab(tab === "codex" ? "tokenplan" : tab);
  },

  async init() {
    // 从 hash（#/stats/{tab}）恢复上次 tab
    const hp = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (hp[0] === "stats" && hp[1] === "kimi") this._active = "kimi";
    else if (hp[0] === "stats" && hp[1] === "codex") this._active = "tokenplan";
    else if (hp[0] === "stats" && hp[1] && this.TABS.some((t) => t.id === hp[1])) this._active = hp[1];
    const el = document.getElementById("view-stats");
    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        <h2 style="font-size:20px">统计概览</h2>
        <div class="spacer"></div>
      </div>
      <div id="stats-tabs" class="tabs"></div>
      <div id="stats-body" class="loading">加载中…</div>`;
    if (["overview", "tokenplan"].includes(this._active)) { this.renderTabs(); this.switchTab(this._active); }
    else this.load();
  },

  // 每个 tab 有独立刷新：概览=全量(总统计)，tokenplan/harness/free=百炼实时，zhipu=仅智谱，local=重读本地
  forceQS(force, tab) {
    if (!force) return "";
    const m = { tokenplan: "live,zhipu", harness: "live", free: "live", local: "local" };
    const mod = m[tab];
    return mod ? `?force_tabs=${mod}` : "?force=true";
  },

  async load(force = false, tab = this._active) {
    const body = document.getElementById("stats-body");
    body.innerHTML = `<div class="loading">${force ? "刷新中…" : "加载统计概览…"}</div>`;
    try {
      const data = await API.get("/api/stats/overview" + this.forceQS(force, tab));
      this._data = data;
      this._forceQuota = force && tab === "tokenplan";
      this.renderTabs();
      this.switchTab(this._active);
    } catch (e) {
      body.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`;
    }
  },

  renderTabs() {
    const wrap = document.getElementById("stats-tabs");
    wrap.innerHTML = this.TABS.map((t) =>
      `<button class="tab-btn ${t.id === this._active ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("");
    wrap.querySelectorAll("[data-tab]").forEach((b) =>
      b.onclick = () => this.switchTab(b.dataset.tab));
  },

  switchTab(id) {
    clearTimeout(this._quotaTimer);
    clearInterval(Dashboard.timer);
    clearInterval(Dashboard.clock);
    clearTimeout(this._geminiUpdatesTimer);
    clearTimeout(this._kimiUpdatesTimer);
    this._active = id;
    // 同步 hash（#/stats/{id}），支持刷新恢复与分享
    const target = `#/stats/${id}`;
    if (location.hash !== target) location.hash = target;
    document.querySelectorAll("#stats-tabs .tab-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === id));
    const body = document.getElementById("stats-body");
    if (!this._data && ['harness', 'free', 'local'].includes(id)) {
      this.load(false, id);
      return;
    }
    const data = this._data || {};
    const label = (this.TABS.find((t) => t.id === id) || {}).label || "";
    // 每个 tab 内容上方有独立刷新按钮：概览=实时拉取百炼，其余=刷新当前 tab 数据
    body.innerHTML = `
      ${["overview","claude","gpt"].includes(id) ? "" : `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn ghost sm" id="btn-refresh-tab">${id === "overview" ? "刷新（实时拉取百炼）" : ["gemini","kimi"].includes(id) ? "刷新动态" : `刷新 ${label}`}</button></div>`}
      <div id="stats-tab-content"></div>`;
    const refreshBtn = document.getElementById("btn-refresh-tab");
    if (refreshBtn) refreshBtn.onclick = () => id === "tokenplan" ? this._refreshAllQuota?.() : id === "codex" ? this.tabCodex(document.getElementById("stats-tab-content"), true) : id === "grok" ? this.tabGrok(document.getElementById("stats-tab-content"), true) : id === "gemini" ? this.loadGeminiUpdates(document.getElementById("stats-tab-content"), true) : id === "kimi" ? this.loadKimiUpdates(document.getElementById("stats-tab-content"), true) : id === "claude" ? this.tabClaude(document.getElementById("stats-tab-content")) : this.load(true, id);
    const content = document.getElementById("stats-tab-content");
    const map = {
      overview: () => Dashboard.mount(content),
      tokenplan: () => this.tabPlanQuota(content),
      harness: () => this.tabHarness(content, data),
      free: () => this.tabFree(content, data),
      local: () => this.tabLocal(content, data),
      codex: () => this.tabCodex(content),
      grok: () => this.tabGrok(content),
      gemini: () => this.tabGemini(content),
      kimi: () => this.tabKimiGuide(content),
      claude: () => this.tabClaude(content),
      gpt: () => this.tabGPT(content),
    };
    (map[id] || map.overview)();
  },

  async tabCodex(body, force = false) {
    body.innerHTML = '<div class="loading">读取 Codex 额度…</div>';
    try {
      const data = await API.get('/api/stats/codex' + (force ? '?force=true' : ''));
      if (data.status !== 'ok') { body.innerHTML = `<div class="msg err">${fmt.esc(data.message)}</div>`; return; }
      const duration = (mins, fallback) => mins == null ? fallback : mins % 10080 === 0 ? `${mins / 10080} 周` : mins % 1440 === 0 ? `${mins / 1440} 天` : mins % 60 === 0 ? `${mins / 60} 小时` : `${mins} 分钟`;
      const groups = data.buckets.map(b => {
        const windows = [["主要窗口", b.primary], ["次要窗口", b.secondary]].filter(([, w]) => w);
        const cards = windows.map(([label, w]) => {
          const used = Number(w.usedPercent);
          const valid = w.usedPercent != null && Number.isFinite(used) && used >= 0 && used <= 100;
          const remaining = valid ? Math.max(0, Math.min(100, 100 - used)) : null;
          const reset = w.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString('zh-CN') : '未知';
          const displayRemaining = remaining === null ? '—' : `${Number(remaining.toFixed(1))}%`;
          const color = remaining === null ? 'unknown' : remaining <= 20 ? 'low' : remaining <= 50 ? 'medium' : 'healthy';
          const name = duration(w.windowDurationMins, label);
          return `<div class="codex-chart-card"><div class="codex-chart-heading"><span>${fmt.esc(name)}额度</span><span class="codex-chart-tag">${fmt.esc(label)}</span></div><div class="codex-card-main"><div class="codex-ring ${color}" style="--remaining:${remaining ?? 0}%" role="img" aria-label="${fmt.esc(name)}额度，剩余 ${fmt.esc(displayRemaining)}，已用 ${valid ? fmt.esc(String(used)) + '%' : '未知'}"><div class="codex-ring-center"><strong>${fmt.esc(displayRemaining)}</strong><span>剩余额度</span></div></div><div class="codex-card-copy"><span>可用额度</span><strong>${fmt.esc(displayRemaining)}</strong><small>剩余可用</small></div></div><div class="codex-chart-details"><div><span>已用额度</span><strong>${valid ? fmt.esc(String(used)) + '%' : '—'}</strong></div><div><span>重置时间</span><strong>${fmt.esc(reset)}</strong></div></div></div>`;
        }).join('');
        return `<div class="codex-group"><h4>${fmt.esc(b.limitName || b.limitId || 'Codex')} ${b.planType ? `<span class="muted">· ${fmt.esc(b.planType)} 方案</span>` : ''}</h4><div class="codex-chart-grid">${cards || '<p class="muted">没有返回额度窗口</p>'}</div></div>`;
      }).join('');
      const updated = data.updated_at ? new Date(data.updated_at * 1000).toLocaleString('zh-CN') : '未知';
      body.innerHTML = `<div class="codex-poster"><div class="codex-poster-hero"><div><div class="codex-poster-eyebrow"><span></span> YOUR AI WORKSPACE / USAGE</div><h3>你的创作能量<br><em>还剩多少？</em></h3><p>CODEX 用量一览 · 每个窗口的剩余额度，一眼掌握。</p></div><div class="codex-poster-mark" aria-hidden="true">✳</div><div class="codex-poster-index" aria-hidden="true">01 / CODEX</div></div><div class="codex-poster-content"><div class="codex-poster-meta"><div><span class="codex-poster-live"></span>${data.stale ? '缓存已过期' : data.cached ? '缓存数据' : '实时数据'}</div><span>更新于 ${fmt.esc(updated)}</span></div>${data.stale ? `<div class="msg err">${fmt.esc(data.message)}</div>` : ''}${groups || '<p class="muted">账户未返回额度窗口。</p>'}<div class="codex-poster-footer"><span>KEEP CREATING ✳</span><span>手动刷新可获取最新数据 ↗</span></div></div></div>`;
    } catch (e) { body.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`; }
  },

  async tabGrok(body, force = false) {
    body.innerHTML = '<div class="loading">读取 Grok 数据…</div>';
    try {
      const data = await API.get('/api/stats/grok' + (force ? '?force=true' : ''));
      const sub = data.subscription, api = data.api;
      const manual = sub ? `<div class="codex-windows"><div class="codex-window"><div class="codex-window-title">订阅额度 · 手动记录</div><div class="codex-remaining">${fmt.esc(String(100 - sub.used_percent))}% <small>剩余</small></div><div class="codex-progress"><i style="width:${100 - sub.used_percent}%"></i></div><div class="muted">已用 ${fmt.esc(String(sub.used_percent))}% · 重置：${sub.resets_at ? fmt.esc(new Date(sub.resets_at).toLocaleString('zh-CN')) : '未填写'}</div><div class="muted">记录时间：${fmt.esc(new Date(sub.updated_at * 1000).toLocaleString('zh-CN'))}</div></div></div>` : '<p class="muted">尚未记录订阅用量。</p>';
      let usage;
      if (api.status === 'ok') {
        const rows = api.groups.map(g => `<tr><td>${fmt.esc(g.name)}</td><td>$${fmt.esc(g.usd.toFixed(4))}</td></tr>`).join('');
        usage = `<p>最近 30 天费用${api.partial ? '（部分结果）' : ''}：<b>$${fmt.esc(api.total_usd.toFixed(4))}</b></p><p class="muted">${fmt.esc(new Date(api.start).toLocaleString('zh-CN'))} 至 ${fmt.esc(new Date(api.end).toLocaleString('zh-CN'))} · 更新：${fmt.esc(new Date(api.updated_at * 1000).toLocaleString('zh-CN'))} · ${api.stale ? '过期缓存，刷新失败' : api.cached ? '缓存数据' : '实时获取'}</p>${api.stale ? `<div class="msg err">${fmt.esc(api.message)}</div>` : ''}${api.partial ? '<p class="msg err">xAI 返回结果已截断，上述金额可能不完整。</p>' : ''}${rows ? `<table><thead><tr><th>项目</th><th>费用（美元）</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">该时间段没有返回用量记录。</p>'}`;
      } else usage = `<p class="muted">${fmt.esc(api.message)}</p>`;
      body.innerHTML = `<div class="panel"><h3>The X Subscription · 快捷入口</h3><p class="muted">订阅用量、账单与开发者 API 分别在以下网站查看。</p><div class="grok-links"><a href="https://grok.com/dashboard" target="_blank" rel="noopener noreferrer"><strong>订阅用量 ↗</strong><span>进入工作台后选择 Usage，查看周额度和重置时间</span></a><a href="https://grok.com/dashboard/billing" target="_blank" rel="noopener noreferrer"><strong>订阅与账单 ↗</strong><span>查看套餐、续费和额外用量余额</span></a><a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer"><strong>xAI 开发者控制台 ↗</strong><span>查看 API 用量及管理密钥</span></a><a href="https://grok.com/" target="_blank" rel="noopener noreferrer"><strong>打开 Grok ↗</strong><span>前往 Grok 对话</span></a></div></div><div class="panel"><h3>The X Subscription · 周额度</h3><p class="muted">Grok 与 Cursor 的合格用量共享周额度。目前未确认公开的订阅用量读取接口；可在订阅用量页面查看后手动记录，此处不会自动更新。</p>${manual}<form id="grok-sub-form" class="grok-form"><label>已用百分比 <input id="grok-used" type="number" min="0" max="100" step="any" required value="${sub ? fmt.esc(String(sub.used_percent)) : ''}"> %</label><label>重置时间（可选） <input id="grok-reset" type="datetime-local"></label><button class="btn sm" type="submit">保存记录</button><span id="grok-save-result" aria-live="polite"></span></form></div><div class="panel"><h3>xAI 开发者 API 费用</h3><p class="muted">团队 API 费用，与上方订阅额度分别统计；使用 Management API 管理密钥读取。</p>${usage}</div>`;
      const reset = body.querySelector('#grok-reset');
      if (sub?.resets_at) { const d = new Date(sub.resets_at); if (!isNaN(d)) { const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); reset.value = local.toISOString().slice(0, 16); } }
      body.querySelector('#grok-sub-form').onsubmit = async e => {
        e.preventDefault();
        const status = body.querySelector('#grok-save-result');
        try {
          await API.put('/api/stats/grok/subscription', {used_percent: Number(body.querySelector('#grok-used').value), resets_at: reset.value ? new Date(reset.value).toISOString() : null});
          await this.tabGrok(body);
        } catch (err) { status.textContent = err.message; }
      };
    } catch (e) { body.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`; }
  },

  tabKimiGuide(body) {
    body.innerHTML = `<section class="kimi-guide"><div class="kimi-guide-hero"><div><span class="gemini-kicker">KIMI / PERSONAL PLAYBOOK</span><h3>把 Kimi，<br><em>用成你的工作搭档。</em></h3><p>从搜索、深度思考到文档和代码，把会员权益用在真正耗时间的任务上。</p></div><div class="quota-spark" aria-hidden="true">✳</div></div><div class="kimi-guide-body"><div class="kimi-use-grid"><article><span>01 / 先从复杂任务开始</span><h4>深度思考</h4><p>适合方案比较、逻辑推理和需要多步分析的问题。先说目标，再补充限制和输出格式。</p><b>示例：比较三个方案，按成本、风险、实施难度给出推荐。</b><a href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer">打开 Kimi ↗</a></article><article><span>02 / 让资料变成答案</span><h4>文件与长文档</h4><p>上传合同、会议纪要、表格或项目资料，让 Kimi 先提炼结构，再回答具体问题。</p><b>示例：从这份会议纪要提取决定、负责人、截止时间和待确认事项。</b><a href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer">开始整理 ↗</a></article><article><span>03 / 交给它完成一段工作</span><h4>Agent 与研究</h4><p>把任务拆成“目标、资料、判断标准、交付格式”，让 Kimi 先给计划，确认后再执行。</p><b>示例：调研 5 个竞品，给出来源、功能差异和适合我的选择。</b><a href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer">体验 Kimi ↗</a></article><article><span>04 / 开发者工作流</span><h4>Kimi Code</h4><p>使用 Kimi Code CLI 处理代码阅读、修改和命令执行。先让它解释计划，再允许修改文件。</p><b>建议：每个任务只给一个清晰目标，完成后让它总结改动和验证结果。</b><a href="https://www.kimi.com/code" target="_blank" rel="noopener noreferrer">了解 Kimi Code ↗</a></article></div><div class="kimi-tips"><h4>更好用的提问模板</h4><p>目标：我想完成什么；背景：它需要知道什么；约束：不能做什么；输出：希望得到什么格式。遇到长任务，先让 Kimi 给计划，再分阶段执行。</p></div><div class="gemini-news-head"><div><span class="gemini-kicker">OFFICIAL UPDATES / 官方动态</span><h3>Kimi 最新消息</h3><p>自动读取 Kimi 研究博客，按全局缓存时间更新。</p></div><button type="button" class="btn ghost sm" id="kimi-updates-refresh">刷新动态</button></div><div id="kimi-updates"><div class="muted">正在获取官方动态…</div></div><div class="gemini-guide-footer"><span>USE KIMI WITH INTENTION ✳</span><a href="https://www.kimi.com/blog/" target="_blank" rel="noopener noreferrer">Kimi 研究博客 ↗</a><a href="https://www.kimi.ai/zh-hans/help/getting-started/overview" target="_blank" rel="noopener noreferrer">Kimi 帮助中心 ↗</a></div></div></section>`;
    this.loadKimiUpdates(body);
    body.querySelector('#kimi-updates-refresh').onclick = () => this.loadKimiUpdates(body, true);
    const tick = () => { if (!body.isConnected || this._active !== 'kimi') return; if (!document.hidden) this.loadKimiUpdates(body); this._kimiUpdatesTimer = setTimeout(tick, 60000); };
    this._kimiUpdatesTimer = setTimeout(tick, 60000);
  },

  async loadKimiUpdates(body, force = false) {
    const target = body.querySelector('#kimi-updates');
    const btn = body.querySelector('#kimi-updates-refresh');
    if (!target || !btn || btn.disabled) return;
    btn.disabled = true;
    if (force) btn.textContent = '刷新中…';
    try {
      const data = await API.get('/api/stats/kimi/updates' + (force ? '?force=true' : ''));
      if (!body.isConnected || !target.isConnected) return;
      const items = (data.items || []).map(item => `<a class="gemini-news-item" href="${fmt.esc(item.url)}" target="_blank" rel="noopener noreferrer"><strong>${fmt.esc(item.title)}</strong><b>↗</b></a>`).join('');
      const updated = data.updated_at ? new Date(data.updated_at * 1000).toLocaleString('zh-CN') : '未知';
      target.innerHTML = data.status !== 'ok' ? '<p class="gemini-news-unavailable">暂时无法获取官方动态，请打开 Kimi 研究博客查看。</p>' : `<p class="gemini-news-meta">${data.stale ? '更新失败，显示上次成功获取的内容' : data.cached ? '缓存内容' : '已获取最新内容'} · 获取时间 ${fmt.esc(updated)}</p><div class="gemini-news-list">${items || '<p class="gemini-news-unavailable">暂无可显示的文章。</p>'}</div>`;
    } catch (_) { if (target.isConnected) target.innerHTML = '<p class="gemini-news-unavailable">暂时无法获取官方动态，请打开 Kimi 研究博客查看。</p>'; }
    finally { btn.disabled = false; btn.textContent = '刷新动态'; }
  },

  async tabKimi(body, force = false) {
    body.innerHTML = '<div class="loading">读取 Kimi 会员额度…</div>';
    try {
      const data = await API.get('/api/stats/kimi' + (force ? '?force=true' : ''));
      if (!body.isConnected) return;
      if (data.status !== 'ok') { body.innerHTML = `<div class="msg err">${fmt.esc(data.message)}</div>`; return; }
      const labels = {monthTotal:'会员月度总额度', monthCode:'Code 月度额度', limit5h:'Code 5 小时额度', limit7d:'Code 每周额度'};
      const cards = data.windows.map(w => {
        const remaining = Math.max(0, Math.min(100, 100 - w.used_percent));
        const color = remaining <= 20 ? 'low' : remaining <= 50 ? 'medium' : 'healthy';
        const reset = w.resets_at ? new Date(w.resets_at).toLocaleString('zh-CN') : '未知';
        return `<div class="codex-chart-card"><div class="codex-chart-heading"><span>${fmt.esc(labels[w.id] || w.id)}</span><span class="codex-chart-tag">会员额度</span></div><div class="codex-card-main"><div class="codex-ring ${color}" style="--remaining:${remaining}%" role="img" aria-label="${fmt.esc(labels[w.id] || w.id)}剩余 ${Number(remaining.toFixed(2))}%"><div class="codex-ring-center"><strong>${Number(remaining.toFixed(2))}%</strong><span>剩余额度</span></div></div><div class="codex-card-copy"><span>已用额度</span><strong>${fmt.esc(String(w.used_percent))}%</strong></div></div><div class="codex-chart-details"><div><span>重置时间</span><strong>${fmt.esc(reset)}</strong></div></div></div>`;
      }).join('');
      const updated = data.updated_at ? new Date(data.updated_at * 1000).toLocaleString('zh-CN') : '未知';
      body.innerHTML = `<div class="quota-poster"><div class="quota-hero"><div><div class="quota-eyebrow">KIMI CODE / MEMBERSHIP</div><h3>你的 Kimi 额度，<br><em>清清楚楚。</em></h3><p>会员总额度与 Code 使用窗口，实时查询。</p></div><div class="quota-spark" aria-hidden="true">✳</div></div><div class="quota-body"><div class="quota-poster-meta"><div><span class="codex-poster-live"></span>${data.stale ? '缓存已过期' : data.cached ? '缓存数据' : '实时数据'}</div><span>更新于 ${fmt.esc(updated)}</span></div>${data.stale ? `<div class="msg err">${fmt.esc(data.message)}</div>` : ''}<div class="quota-section-head"><div><span>MEMBERSHIP / 会员额度</span><h3>用量概览</h3></div></div><div class="codex-chart-grid">${cards || '<p class="quota-empty">账户暂未返回额度窗口。</p>'}</div><div class="quota-poster-footer"><span>KIMI / USAGE</span><span>点击刷新可重新获取</span></div></div></div>`;
    } catch (e) { body.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`; }
  },

  tabClaude(body) {
    body.innerHTML = `<div class="quota-poster"><div class="quota-hero claude-hero"><div><div class="quota-eyebrow">ANTHROPIC / CLAUDE</div><h3>认识 Claude，<br><em>你的 AI 助手。</em></h3><p>写作、分析、编程与长文档处理，汇聚在一个地方。</p></div><div class="quota-spark" aria-hidden="true">✳</div></div><div class="quota-body"><div class="claude-intro"><div><h4>Claude</h4><p>Anthropic 提供的 AI 助手，可用于对话、内容创作、信息分析和代码任务。通过官网登录后可使用相应功能并查看账户信息。</p></div><div><h4>Claude Code</h4><p>面向软件开发的命令行工具，可以协助理解代码、修改项目和运行开发任务。</p></div><div><h4>适合的场景</h4><p>可以用来梳理资料、讨论思路、撰写内容，以及协助理解和维护代码项目。</p></div></div><div class="grok-links"><a href="https://claude.ai/" target="_blank" rel="noopener noreferrer"><strong>打开 Claude ↗</strong><span>前往 Claude 官网</span></a><a href="https://www.anthropic.com/claude-code" target="_blank" rel="noopener noreferrer"><strong>了解 Claude Code ↗</strong><span>查看官方产品介绍</span></a></div></div></div>`;
  },

  tabGPT(body) {
    const modes = [
      { name: 'Astra', family: 'GPT-6', tag: '复杂推理', tone: 'purple', desc: '适合多约束、长链路和需要反复验证的任务。把目标、背景、限制和验收标准一次说清楚。', use: '方案推演、难题分析、研究报告、复杂决策', prompt: '比较三种方案，按成本、风险、实施难度和长期收益给出推荐。' },
      { name: 'Terra', family: 'GPT-6.1', tag: '代码与结构化', tone: 'blue', desc: '适合代码、数据处理和需要稳定输出格式的工作。先让它列计划，再分步骤修改和检查。', use: '编程、重构、SQL、接口设计、表格处理', prompt: '阅读这个项目，先列出影响范围，再给出最小改动方案和验证清单。' },
      { name: 'Sol', family: 'GPT-6.1 / GPT-5.6', tag: '日常主力', tone: 'green', desc: '速度、能力和上下文的平衡选择。日常写作、分析和一般开发任务，优先从这里开始。', use: '写作、总结、翻译、日常问答、常规开发', prompt: '把下面内容整理成一页可执行计划，保留关键事实，并标出待确认项。' },
      { name: 'Luna', family: 'GPT-6 / GPT-5.6', tag: '快速轻量', tone: 'orange', desc: '适合快速试错、短问题和批量小任务。需要速度时先用它，遇到复杂问题再升级模型。', use: '快速改写、分类、提取、草稿、简单脚本', prompt: '用三句话总结这段内容，再给出一个更清晰的标题。' },
    ];
    const vendors = [
      { name: 'Grok', kicker: 'xAI / REAL-TIME', tone: 'grok', desc: '适合关注实时话题、快速讨论和开放式探索。需要最新信息时，先确认是否启用了联网或引用来源。', strong: '实时探索 · 观点碰撞 · 快速问答', site: 'https://grok.com/' },
      { name: 'Kimi', kicker: 'MOONSHOT / LONG CONTEXT', tone: 'kimi', desc: '适合长文档、资料整理、深度研究和代码协作。先给资料，再让它抽取结构与行动项。', strong: '长文本 · 文档研究 · Kimi Code', site: 'https://www.kimi.com/' },
      { name: 'Gemini', kicker: 'GOOGLE AI / MULTIMODAL', tone: 'gemini', desc: '适合图片、文件、研究和 Google 生态协作。需要使用会员权益时，先确认账号和地区支持范围。', strong: '多模态 · 深度研究 · Google 生态', site: 'https://gemini.google.com/' },
      { name: 'Claude', kicker: 'ANTHROPIC / CAREFUL WORK', tone: 'claude', desc: '适合长文写作、复杂资料分析、代码阅读和需要稳定表达的工作。复杂任务先让它给出结构。', strong: '长文写作 · 分析 · Claude Code', site: 'https://claude.ai/' },
    ];
    body.innerHTML = `<section class="gpt-guide"><div class="gpt-guide-hero"><div><span class="gpt-kicker">GPT / MODEL PLAYBOOK</span><h3>先选对模式，<br><em>再开始工作。</em></h3><p>这里不比较宣传参数，只告诉你每种模式适合什么任务、什么时候切换，以及怎样提问更容易得到好结果。</p></div><div class="gpt-guide-mark" aria-hidden="true">G</div></div><div class="gpt-guide-body"><div class="gpt-guide-intro"><div><span class="gpt-kicker">MODEL MAP / 模型地图</span><h3>四种模式怎么选</h3></div><p>名称和可用版本以你当前客户端显示为准。下面是工作流上的定位建议，不代表固定速度、额度或官方基准排名。</p></div><div class="gpt-mode-grid">${modes.map((m, i) => `<article class="gpt-mode-card ${m.tone}"><div class="gpt-mode-top"><span>0${i + 1} / ${m.family}</span><b>${m.tag}</b></div><h4>${m.family} ${m.name}</h4><p>${m.desc}</p><div class="gpt-mode-use"><strong>适合</strong><span>${m.use}</span></div><div class="gpt-mode-prompt"><strong>可以这样说</strong><span>${m.prompt}</span></div></article>`).join('')}</div><div class="gpt-switch-guide"><div><span class="gpt-kicker">SWITCH WHEN / 什么时候切换</span><h3>一个简单的升级路径</h3></div><div class="gpt-switch-steps"><div><b>01</b><strong>先用 Sol</strong><span>先把问题讲清楚，获得第一版结果。</span></div><div><b>02</b><strong>遇到瓶颈换 Terra</strong><span>代码、数据和结构化输出需要更稳定时切换。</span></div><div><b>03</b><strong>需要深度换 Astra</strong><span>多步推理、方案权衡或复杂研究再升级。</span></div><div><b>04</b><strong>重复小任务用 Luna</strong><span>追求速度和批量处理时降低成本与等待。</span></div></div></div><div class="gpt-practice"><div><strong>使用小技巧</strong><p>先说明目标，再给背景、约束和输出格式；长任务先让模型给计划，确认后再执行。结果不理想时，优先补充信息和验收标准，再考虑换模型。</p></div><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">打开 GPT ↗</a></div><div class="gpt-guide-footer"><span>CHOOSE THE MODE FOR THE WORK ✳</span><a href="https://help.openai.com/" target="_blank" rel="noopener noreferrer">OpenAI 帮助中心 ↗</a><a href="#/stats/overview">返回统计概览 ↗</a></div></div></section>`;
    body.querySelectorAll('.gpt-mode-card').forEach((card, index) => {
      card.insertAdjacentHTML('beforeend', `<div class="gpt-poster-stamp">${modes[index].tag}</div>`);
    });
    const vendorSection = document.createElement('section');
    vendorSection.className = 'gpt-vendor-section';
    vendorSection.innerHTML = `<div class="gpt-guide-intro"><div><span class="gpt-kicker">MODEL ATLAS / 模型家族</span><h3>其他模型，各自擅长什么</h3></div><p>这是工作流定位，实际能力会随版本、账号、地区和联网状态变化。点击卡片进入对应官网。</p></div><div class="gpt-vendor-grid">${vendors.map(v => `<a class="gpt-vendor-card ${v.tone}" href="${v.site}" target="_blank" rel="noopener noreferrer"><div class="gpt-vendor-kicker">${v.kicker}</div><h4>${v.name}</h4><p>${v.desc}</p><strong>${v.strong}</strong><span class="gpt-vendor-link">了解 ${v.name} ↗</span></a>`).join('')}</div>`;
    body.querySelector('.gpt-guide-body')?.insertBefore(vendorSection, body.querySelector('.gpt-switch-guide'));
  },

  tabGemini(body) {
    clearTimeout(this._geminiUpdatesTimer);
    body.innerHTML = this.geminiBenefitsGuide();
    this.loadGeminiUpdates(body);
    body.querySelector('#gemini-updates-refresh').onclick = () => this.loadGeminiUpdates(body, true);
    const updateTick = () => {
      if (!body.isConnected || this._active !== 'gemini' || !document.getElementById('view-stats')?.classList.contains('active')) return;
      if (!document.hidden) this.loadGeminiUpdates(body);
      this._geminiUpdatesTimer = setTimeout(updateTick, 60000);
    };
    this._geminiUpdatesTimer = setTimeout(updateTick, 60000);
  },

  geminiBenefitsGuide() {
    const features = [
      {num:'01',tag:'先试这个',title:'Gemini 对话与文件分析',desc:'整理长文、表格、图片与代码，也可以用更强的模型处理复杂问题。',steps:'打开 Gemini → 新建对话 → 上传文件或选择模型 → 描述目标与输出格式。',example:'示例：分析这份项目方案，列出风险、待确认问题和下一步行动。',url:'https://gemini.google.com/',source:'https://support.google.com/gemini/answer/14903178',label:'打开 Gemini'},
      {num:'02',tag:'调研利器',title:'Deep Research 深度研究',desc:'针对复杂问题制定研究计划，检索资料并生成带来源的报告。',steps:'在 Gemini 输入框选择「添加文件 → Deep Research」→ 输入问题 → 检查计划 → 开始研究。',example:'示例：调研 AI 用量管理工具，对比功能、价格和官方资料来源。',url:'https://gemini.google.com/',source:'https://support.google.com/gemini/answer/15719111',label:'开始研究'},
      {num:'03',tag:'资料整理',title:'Gemini Notebook 笔记本',desc:'把项目资料、文档和网页整理成一个笔记本，围绕来源提问并制作学习材料。',steps:'打开 Gemini Notebook（原 NotebookLM）→ 新建笔记本 → 添加资料 → 提问或生成音频概览。',example:'示例：导入会议记录和旧方案，整理决策依据及仍待解决的问题。',url:'https://notebook.google/',source:'https://support.google.com/gemini/answer/16972047',label:'打开笔记本'},
      {num:'04',tag:'视频创作',title:'Google Flow 图像与视频',desc:'使用 Google 的生成工具制作和编辑视觉内容，适合广告短片、分镜和创意探索。',steps:'打开 Flow → 使用会员账号登录 → 新建项目 → 选择可用的生成工具并输入描述。',example:'示例：为一个科技工作台制作 8 秒产品介绍短片，风格简洁明亮。',url:'https://labs.google/flow/',source:'https://one.google.com/about/google-ai-plans/',label:'打开 Flow'},
      {num:'05',tag:'办公提效',title:'Gmail 与 Google 文档',desc:'在支持的 Google 应用中使用 Gemini 协助起草、润色和整理内容。',steps:'打开 Gmail 或 Google 文档 → 查找 Gemini 按钮或侧栏 → 提出明确的整理、撰写或修改要求。',example:'示例：将这份会议纪要整理成发给团队的简洁邮件。',url:'https://docs.google.com/',source:'https://support.google.com/googleone/answer/14534406',label:'打开 Google 文档'},
      {num:'06',tag:'开发者',title:'Google AI Studio 与 API',desc:'在浏览器中试用模型、调试提示词并构建原型；API 项目的用量和计费另行管理。',steps:'打开 AI Studio → 登录同一账号 → 选择模型并测试；如需 API，先查看项目额度与计费设置。',example:'示例：测试同一组提示词，比较模型输出是否适合你的应用。',url:'https://aistudio.google.com/',source:'https://ai.google.dev/gemini-api/docs/billing',label:'打开 AI Studio'},
      {num:'07',tag:'编程助手',title:'Google Antigravity',desc:'使用 AI 辅助阅读代码、开发和执行任务。会员可提供更高限额，实际资格以账号和地区为准。',steps:'打开 Antigravity 官网 → 登录 → 根据设备选择应用或 CLI → 在受支持的工作区开始使用。',example:'示例：分析项目结构，列出实现新功能前需要修改的文件。',url:'https://antigravity.google/',source:'https://antigravity.google/docs/plans',label:'打开 Antigravity'},
      {num:'08',tag:'订阅管理',title:'云存储与会员权益',desc:'Google One 包含云存储和其他会员权益；容量、可共享项目及福利可能因套餐和地区不同。',steps:'打开 Google One → 查看你的会员方案、存储、福利和家庭共享设置。',example:'建议：先确认你的账户显示的实际福利，不同账户不一定相同。',url:'https://one.google.com/',source:'https://support.google.com/googleone/answer/14534406',label:'打开 Google One'},
    ];
    return `<section class="gemini-guide" id="gemini-guide"><div class="gemini-guide-hero"><div><span class="gemini-kicker">YOUR GOOGLE AI PRO / PLAYBOOK</span><h3>认识 Gemini，<br><em>了解你的会员权益。</em></h3><p>把研究、工作、创作和开发放到一张清单里。每项都附上入口和第一步。</p></div><span class="gemini-guide-spark" aria-hidden="true">✳</span></div><div class="gemini-guide-body"><div class="gemini-guide-intro"><div><span class="gemini-kicker">START HERE / 从这里开始</span><h3>8 项值得了解的权益</h3></div><p>指南依据 Google 公开资料整理，核对日期：2026-11-04。具体功能、地区、年龄限制与额度以账号页面为准。</p></div><div class="gemini-benefits-grid">${features.map(f => `<article class="gemini-benefit"><div class="gemini-benefit-top"><span>${f.num} / ${f.tag}</span><span>✳</span></div><h4>${f.title}</h4><p>${f.desc}</p><div class="gemini-benefit-step"><b>怎么用</b><span>${f.steps}</span></div><div class="gemini-benefit-example">${f.example}</div><div class="gemini-benefit-links"><a href="${f.url}" target="_blank" rel="noopener noreferrer">${f.label} ↗</a><a href="${f.source}" target="_blank" rel="noopener noreferrer">官方说明 ↗</a></div></article>`).join('')}</div><div class="gemini-guide-reminder"><b>使用前确认</b><p>不同产品有各自的额度和地区限制。部分功能、额外积分或开发者 API 可能需要单独开通或付费；请在对应产品中确认。当前账号此前收到过 Antigravity 地区资格提示，能否使用以官方页面为准。</p><a href="https://one.google.com/" target="_blank" rel="noopener noreferrer">查看我的会员权益 ↗</a></div><div class="gemini-news-head"><div><span class="gemini-kicker">OFFICIAL UPDATES / 官方动态</span><h3>追踪 Gemini 最新消息</h3><p>来自 Google 官方博客，文章可能涵盖非 Pro 专属功能；是否可用以你的账号为准。</p></div><button type="button" class="btn ghost sm" id="gemini-updates-refresh">刷新动态</button></div><div id="gemini-updates"><div class="muted">正在获取官方动态…</div></div><div class="gemini-guide-footer"><span>MAKE YOUR MEMBERSHIP WORK FOR YOU ✳</span><a href="https://blog.google/products/gemini/" target="_blank" rel="noopener noreferrer">更多 Google 官方动态 ↗</a><a href="https://support.google.com/googleone/answer/14534406" target="_blank" rel="noopener noreferrer">Google AI Pro 权益说明 ↗</a></div></div></section>`;
  },

  async loadGeminiUpdates(body, force = false) {
    const target = body.querySelector('#gemini-updates');
    const btn = body.querySelector('#gemini-updates-refresh');
    if (!target || !btn || btn.disabled) return;
    btn.disabled = true;
    if (force) btn.textContent = '刷新中…';
    try {
      const data = await API.get('/api/stats/gemini/updates' + (force ? '?force=true' : ''));
      if (!body.isConnected || !target.isConnected) return;
      if (data.status !== 'ok') { target.innerHTML = '<p class="gemini-news-unavailable">暂时无法获取官方动态，请检查网络或使用下方官方链接。</p>'; return; }
      const items = (data.items || []).map(item => {
        let link;
        try { link = new URL(item.url); } catch (_) { return ''; }
        if (link.protocol !== 'https:' || !['blog.google', 'www.blog.google'].includes(link.hostname)) return '';
        const date = item.published_at ? new Date(item.published_at) : null;
        return `<a class="gemini-news-item" href="${fmt.esc(link.href)}" target="_blank" rel="noopener noreferrer"><span>${date && !isNaN(date) ? fmt.esc(date.toLocaleDateString('zh-CN')) : '日期未知'}</span><strong>${fmt.esc(item.title)}</strong><b>↗</b></a>`;
      }).join('');
      const updated = data.updated_at ? new Date(data.updated_at * 1000).toLocaleString('zh-CN') : '未知';
      target.innerHTML = `<p class="gemini-news-meta">${data.stale ? '更新失败，显示上次成功获取的内容' : data.cached ? '缓存内容' : '已获取最新内容'} · 获取时间 ${fmt.esc(updated)} · 标题为官方原文</p><div class="gemini-news-list">${items || '<p class="gemini-news-unavailable">暂无可显示的文章。</p>'}</div>`;
    } catch (_) { if (target.isConnected) target.innerHTML = '<p class="gemini-news-unavailable">暂时无法获取官方动态，请检查网络或使用下方官方链接。</p>'; }
    finally { btn.disabled = false; btn.textContent = '刷新动态'; }
  },

  /* ---- Tab: 概览 ---- */
  tabOverview(body, data) {
    const live = data.live || {}, local = live.account ? live.local_usage || {} : data.local || {}, prov = data.providers || {};
    const tp = live.token_plan || {};
    const pct = typeof tp.per1MonthPercentage === "number" ? tp.per1MonthPercentage : null;
    const harnessItems = Array.isArray(live.harness_official_tool?.items) ? live.harness_official_tool.items : [];
    const zc = data.zhipu_code_plan || {};
    body.innerHTML = `
      <div class="cards">
        <div class="card">
          <h4>${fmt.esc(live.account?.label || "Token Plan")} · 月度用量</h4>
          <div class="value ${pct > 0.8 ? "red" : pct > 0.5 ? "amber" : ""}">${pct == null ? live.quota_status === "api_key_only" ? "仅 API Key" : "待授权" : fmt.pct(pct)}</div>
          <div class="sub">${pct == null ? "官方配额未接入，点击查看账号状态" : `下次重置：${fmt.maskTime(tp.per1MonthResetTime)}`}</div><a href="#/stats/tokenplan">查看配额与个人账号 →</a>
        </div>
        <div class="card">
          <h4>${fmt.esc(live.account?.label || "本地")} · 累计调用</h4>
          <div class="value">${fmt.num(local.calls)}</div>
          <div class="sub">仅统计本工作台调用，不代表账号总用量</div>
        </div>
        <div class="card">
          <h4>${fmt.esc(live.account?.label || "本地")} · 累计 Token</h4>
          <div class="value">${fmt.num(local.total_tokens)}</div>
          <div class="sub">输入 ${fmt.num(local.input_tokens)} / 输出 ${fmt.num(local.output_tokens)}</div>
        </div>
        <div class="card">
          <h4>Harness 权益工具</h4>
          <div class="value">${live.harness_official_tool?.items ? harnessItems.length : "—"}</div>
          <div class="sub">${live.harness_official_tool?.items ? "official_tool 配额项" : "官方权益数据未接入"}</div>
        </div>
      </div>

      <div class="panel">
        <h3>多 Provider 概览（Key 管理）</h3>
        ${this.providersTable(prov)}
      </div>

      <div class="panel">
        <h3>智谱 Code Plan</h3>
        ${this.zhipuStatus(zc, (prov.zhipu || {}).key_count || 0)}
      </div>

      <div class="panel">
        <h3>最近访问页面</h3>
        <div id="ov-access"><span class="muted">加载中…</span></div>
      </div>`;
    this.loadAccessPanel();
  },

  async loadAccessPanel() {
    const el = document.getElementById("ov-access");
    if (!el) return;
    try {
      const { items } = await API.get("/api/access/records?limit=10");
      if (!items.length) { el.innerHTML = `<div class="muted">暂无访问记录</div>`; return; }
      const names = { stats: "统计概览", keys: "Key 管理", trial: "模型体验" };
      el.innerHTML = `<table>
        <thead><tr><th>时间</th><th>页面</th><th>URL</th></tr></thead>
        <tbody>${items.map((r) => `
          <tr>
            <td>${fmt.maskTime(r.created_at)}</td>
            <td><span class="tag">${fmt.esc(names[r.view] || r.view || "—")}</span></td>
            <td class="code" title="${fmt.esc(r.url)}">${fmt.esc((r.url || "").slice(0, 60))}</td>
          </tr>`).join("")}</tbody></table>`;
    } catch (e) {
      el.innerHTML = `<span class="muted">${fmt.esc(e.message)}</span>`;
    }
  },

  /* ---- Tab: Plan 配额（阿里云 Token Plan + 智谱 GLM Code Plan 合并） ---- */
  async tabPlanQuota(body) {
    body.innerHTML = '<div class="loading">读取账号配置…</div>';
    let accounts;
    try { accounts = (await API.get('/api/stats/bailian/accounts')).items || []; }
    catch (e) { body.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`; return; }
    if (!body.isConnected || this._active !== 'tokenplan') return;
    const primary = accounts.find(a => a.primary), others = accounts.filter(a => !a.primary);
    const sources = [
      {id:'live', label:primary ? `百炼 Token Plan · ${primary.label}` : '百炼 Token Plan', tag:primary ? 'ALIYUN / 主账号' : 'ALIYUN', url:'/api/stats/quota/live', site:'https://bailian.console.aliyun.com/'},
      {id:'zhipu', label:'智谱 Code Plan', tag:'ZHIPU', url:'/api/stats/quota/zhipu', site:'https://open.bigmodel.cn/'},
      {id:'codex', label:'Codex', tag:'OPENAI', url:'/api/stats/codex', site:'https://chatgpt.com/codex'},
      {id:'kimi', label:'Kimi', tag:'KIMI', url:'/api/stats/kimi', site:'https://www.kimi.com/'},
    ];
    const state = sources.map(source => source.url ? ({status:'加载中', lines:['正在读取…'], detail:'<p class="quota-empty">正在读取额度…</p>'}) : ({status:'暂未接入', lines:['用量待接入'], detail:'<p class="quota-empty">Claude 用量暂未接入，可前往官网查看。</p>'}));
    const pending = sources.map(() => false);
    let current = Math.min(this._quotaIndex || 0, sources.length - 1);
    const pct = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
    const show = n => n == null ? '—' : `${Number(n.toFixed(2))}%`;
    const duration = n => n == null ? '配额窗口' : n % 10080 === 0 ? `${n / 10080} 周` : n % 1440 === 0 ? `${n / 1440} 天` : n % 60 === 0 ? `${n / 60} 小时` : `${n} 分钟`;
    const date = value => { const d = new Date(value); return value && !isNaN(d) ? fmt.esc(d.toLocaleString('zh-CN')) : '未知'; };
    const ring = w => {
      const value = pct(w.used), remaining = value == null ? null : 100 - value;
      const color = remaining == null ? 'unknown' : remaining <= 20 ? 'low' : remaining <= 50 ? 'medium' : 'healthy';
      return `<div class="codex-chart-card"><div class="codex-chart-heading"><span>${fmt.esc(w.name)}</span><span class="codex-chart-tag">剩余额度</span></div><div class="codex-card-main"><div class="codex-ring ${color}" style="--remaining:${remaining ?? 0}%" role="img" aria-label="${fmt.esc(w.name)}，剩余 ${show(remaining)}"><div class="codex-ring-center"><strong>${show(remaining)}</strong><span>剩余额度</span></div></div><div class="codex-card-copy"><span>已用额度</span><strong>${show(value)}</strong><small>当前窗口</small></div></div><div class="codex-chart-details"><div><span>重置时间</span><strong>${date(w.reset)}</strong></div>${w.extra ? `<div><span>剩余 / 总额度</span><strong>${fmt.esc(w.extra)}</strong></div>` : ''}</div></div>`;
    };
    function parse(index, result) {
      let windows = [], message = '', data = result.data || {};
      const apiOnly = index === 0 && data.quota_status === 'api_key_only';
      if (index === 0) {
        const tp = data.token_plan || {}, used = pct(typeof tp.per1MonthPercentage === 'number' ? tp.per1MonthPercentage * 100 : null);
        if (used != null) windows.push({name:'月度额度', used, reset:tp.per1MonthResetTime});
        else message = apiOnly ? '公司仅提供 API Key，官方配额暂不可查询。以下仅统计通过本工作台发起的调用，不包含其他工具或同事的使用。' : data.login_command ? 'Key 已配置 · 配额待授权。请使用此账号完成独立的百炼控制台登录。' : '百炼额度暂不可用，请检查此账号的控制台登录状态或网络。';
      } else if (index === 1) {
        if (data.status === 'ok') windows = (data.periods || []).map(p => ({name:p.unit || '配额窗口', used:pct(p.percentage), reset:p.next_reset_ms, extra:`${p.remaining ?? '—'} / ${p.total ?? '—'}`}));
        else message = data.note || '智谱额度暂不可用。';
      } else if (index === 2) {
        if (result.status === 'ok') windows = (result.buckets || []).flatMap(b => [b.primary,b.secondary].filter(Boolean).map(w => ({name:`${b.limitName || b.limitId || 'Codex'} · ${duration(w.windowDurationMins)}`, used:pct(w.usedPercent), reset:w.resetsAt ? w.resetsAt * 1000 : null})));
        else message = result.message || 'Codex 额度暂不可用。';
      } else {
        const labels = {monthTotal:'会员月度总额度',monthCode:'Code 月度额度',limit5h:'Code 5 小时额度',limit7d:'Code 每周额度'};
        if (result.status === 'ok') windows = (result.windows || []).map(w => ({name:labels[w.id] || w.id, used:pct(w.used_percent), reset:w.resets_at}));
        else message = result.message || 'Kimi 额度暂不可用。';
      }
      const updated = result.updated_at ? new Date(result.updated_at * 1000).toLocaleString('zh-CN') : '';
      const status = result.stale ? '刷新失败 · 过期缓存' : windows.length ? result.cached ? '缓存数据' : '实时数据' : apiOnly ? 'Key 已配置 · 官方配额未接入' : '额度不可用';
      return {status, lines:windows.length ? windows.map(w => `${w.name} 剩余 ${show(w.used == null ? null : 100-w.used)}`) : apiOnly ? ['官方配额暂不可查询', `本工作台调用 ${fmt.num(data.local_usage?.calls)} 次`] : ['额度不可用'], detail:windows.length ? windows.map(ring).join('') : `<div class="quota-empty">${fmt.esc(message || '账户未返回额度窗口。')}${apiOnly ? `<div class="bailian-local-usage"><strong>${fmt.num(data.local_usage?.calls)} 次调用</strong><strong>${fmt.num(data.local_usage?.total_tokens)} Tokens</strong><a href="#/keys">查看公司 Key →</a></div>` : ''}${data.login_command ? `<p>在本机终端运行以下命令，并登录对应账号：</p><code class="bailian-login-command">${fmt.esc(data.login_command)}</code>` : ''}</div>`, updated};
    }
    body.innerHTML = `<div class="quota-poster"><div class="quota-hero"><div><div class="quota-eyebrow">YOUR AI WORKSPACE / QUOTA</div><h3>你的 AI 能量，<br><em>一眼掌握。</em></h3><p>各平台的额度状态，汇聚在一个地方。</p></div><div class="quota-spark" aria-hidden="true">✳</div></div><div class="quota-body"><div class="quota-summary">${sources.map((c,i) => `<div class="quota-summary-wrap"><button class="quota-summary-card" type="button" data-quota-index="${i}"><span class="quota-summary-tag">0${i+1} / ${c.tag}</span><strong>${fmt.esc(c.label)}</strong><span class="quota-summary-lines"></span><span class="quota-summary-foot"></span></button>${c.url ? `<button type="button" class="quota-card-refresh" data-quota-refresh="${i}" aria-label="刷新 ${fmt.esc(c.label)}" title="刷新 ${fmt.esc(c.label)}">↻</button>` : ''}<a class="quota-site-link" href="${c.site}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${fmt.esc(c.label)} 官网">官网 ↗</a></div>`).join('')}</div>${others.length ? `<details class="bailian-other-accounts" id="bailian-other-accounts"><summary>其他账号 <span>查看更多（${others.length}） ↗</span></summary><p>当前展示${fmt.esc(primary.label)}。备用账号收在这里，展开后读取，独立缓存。</p>${others.map(a => `<section class="bailian-account-detail"><div class="quota-slide-title"><h4>${fmt.esc(a.label)}</h4><div class="quota-slide-links"><button class="btn ghost sm" type="button" data-account-refresh="${fmt.esc(a.id)}" aria-label="刷新${fmt.esc(a.label)}">↻ 刷新</button><a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer">官网 ↗</a></div></div><div data-account-content="${fmt.esc(a.id)}">展开后读取额度…</div></section>`).join('')}</details>` : ''}<div class="quota-section-head"><div><span>QUOTA DETAILS / 配额详情</span><h3>每一份额度，都看得见。</h3></div><div class="quota-nav"><button type="button" id="quota-prev" aria-label="上一张">←</button><span id="quota-position"></span><button type="button" id="quota-next" aria-label="下一张">→</button></div></div><div id="quota-slide" aria-live="polite"></div><div class="quota-poster-footer"><span>KEEP CREATING ✳</span><span>页面打开时按缓存设置自动更新 · 卡片右上角可单独刷新</span></div></div></div>`;
    const active = () => body.isConnected && this._active === 'tokenplan' && document.getElementById('view-stats')?.classList.contains('active');
    const render = () => {
      if (!active()) return;
      body.querySelectorAll('[data-quota-index]').forEach((el,i) => {
        el.classList.toggle('selected', i === current); el.setAttribute('aria-pressed', i === current ? 'true' : 'false');
        el.querySelector('.quota-summary-lines').innerHTML = state[i].lines.map(line => `<span>${fmt.esc(line)}</span>`).join('');
        el.querySelector('.quota-summary-foot').textContent = state[i].status + (state[i].updated ? ` · ${state[i].updated}` : '');
      });
      const item = state[current], source = sources[current];
      body.querySelector('#quota-slide').innerHTML = `<div class="quota-slide-title"><div><span>${source.tag} / 0${current+1}</span><h4>${fmt.esc(source.label)}</h4></div><div class="quota-slide-links"><span class="quota-slide-status">${fmt.esc(item.status)}</span><a href="${source.site}" target="_blank" rel="noopener noreferrer">官网 ↗</a></div></div><div class="codex-chart-grid">${item.detail}</div>${item.updated ? `<p class="quota-slide-note">更新于 ${fmt.esc(item.updated)}</p>` : ''}`;
      body.querySelector('#quota-position').textContent = `${String(current+1).padStart(2,'0')} / ${String(sources.length).padStart(2,'0')}`;
      this._quotaIndex = current;
    };
    const refresh = async (i, force = false) => {
      if (!sources[i].url || pending[i] || !active()) return;
      pending[i] = true;
      const btn = body.querySelector(`[data-quota-refresh="${i}"]`);
      btn.disabled = true; btn.classList.add('refreshing');
      try {
        const result = await API.get(sources[i].url + (force ? '?force=true' : ''));
        if (!active()) return;
        state[i] = parse(i, result);
      } catch (_) {
        if (!active()) return;
        state[i] = state[i].updated ? {...state[i], status:'刷新失败 · 显示旧数据'} : {status:'读取失败', lines:['额度不可用'], detail:'<p class="quota-empty">读取失败，请检查网络或登录状态后重试。</p>'};
      } finally {
        pending[i] = false; btn.disabled = false; btn.classList.remove('refreshing');
        render();
      }
    };
    const otherPending = new Set();
    const refreshOther = async (account, force = false) => {
      if (otherPending.has(account.id) || !active()) return;
      otherPending.add(account.id);
      const target = body.querySelector(`[data-account-content="${account.id}"]`);
      const button = body.querySelector(`[data-account-refresh="${account.id}"]`);
      button.disabled = true;
      try {
        const result = await API.get(`/api/stats/quota/live?account_id=${encodeURIComponent(account.id)}${force ? '&force=true' : ''}`);
        if (!active()) return;
        const item = parse(0, result);
        target.innerHTML = `<div class="codex-chart-grid">${item.detail}</div><p class="quota-slide-note">${fmt.esc(item.status)} · ${fmt.esc(item.updated)}</p>`;
      } catch (e) { if (active()) target.innerHTML = `<p class="quota-empty">${fmt.esc(e.message)}</p>`; }
      finally { otherPending.delete(account.id); button.disabled = false; }
    };
    const otherDetails = body.querySelector('#bailian-other-accounts');
    if (otherDetails) {
      otherDetails.ontoggle = () => { if (otherDetails.open) others.forEach(a => refreshOther(a)); };
      body.querySelectorAll('[data-account-refresh]').forEach(button => {
        button.onclick = () => refreshOther(others.find(a => a.id === button.dataset.accountRefresh), true);
      });
    }
    this._refreshAllQuota = () => {
      sources.forEach((_,i) => refresh(i, true));
      if (otherDetails?.open) others.forEach(a => refreshOther(a, true));
    };
    body.querySelector('#quota-prev').onclick = () => { current = (current + sources.length - 1) % sources.length; render(); };
    body.querySelector('#quota-next').onclick = () => { current = (current + 1) % sources.length; render(); };
    body.querySelectorAll('[data-quota-index]').forEach(el => el.onclick = () => { current = Number(el.dataset.quotaIndex); render(); });
    body.querySelectorAll('[data-quota-refresh]').forEach(el => el.onclick = () => refresh(Number(el.dataset.quotaRefresh), true));
    render();
    sources.forEach((_,i) => refresh(i));
    const tick = () => {
      if (!active()) return;
      if (!document.hidden) { sources.forEach((_,i) => refresh(i)); if (otherDetails?.open) others.forEach(a => refreshOther(a)); }
      this._quotaTimer = setTimeout(tick, 60000);
    };
    this._quotaTimer = setTimeout(tick, 60000);
  },

  zhipuQuotaTable(zc) {
    const periods = Array.isArray(zc.periods) ? zc.periods : [];
    if (zc.status === "ok" && periods.length) {
      return `<table>
        <thead><tr><th>周期</th><th>总额度</th><th>已用</th><th>剩余</th><th>使用%</th><th>下次重置</th></tr></thead>
        <tbody>${periods.map((p) => `
          <tr>
            <td>${fmt.esc(p.unit)}</td>
            <td>${fmt.num(p.total)}</td>
            <td>${fmt.num(p.used)}</td>
            <td>${fmt.num(p.remaining)}</td>
            <td>${this.percentBar(p.percentage)}</td>
            <td>${fmt.maskTime(p.next_reset_ms)}</td>
          </tr>`).join("")}</tbody></table>`;
    }
    if (zc.status === "error") return `<div class="msg err">${fmt.esc(zc.note)}</div>`;
    return `<div class="muted" style="margin-top:10px">${fmt.esc(zc.note || "")}</div>`;
  },

  /* ---- Tab: Harness ---- */
  tabHarness(body, data) {
    const live = data.live || {};
    const harness = live.harness_official_tool || {};
    const harnessItems = Array.isArray(harness.items) ? harness.items : [];
    body.innerHTML = `
      <div class="panel">
        <h3>Harness 权益额度（official_tool）${harness.generatedAt ? `· 更新于 ${fmt.maskTime(harness.generatedAt)}` : ""}</h3>
        ${harnessItems.length ? `
        <table>
          <thead><tr><th>工具</th><th>单位</th><th>总额度</th><th>已用</th><th>剩余</th><th>使用%</th><th>到期</th></tr></thead>
          <tbody>${harnessItems.map((it) => `
            <tr>
              <td>${fmt.esc(it.title)}</td>
              <td>${fmt.esc(it.quotaUnit || "—")}</td>
              <td>${fmt.num(it.totalQuota)}</td>
              <td>${fmt.num(it.usedQuota)}</td>
              <td>${fmt.num(it.availableQuota)}</td>
              <td>${this.percentBar(it.usedPercent)}</td>
              <td>${fmt.maskTime(it.instanceEndTime)}</td>
            </tr>`).join("")}
          </tbody>
        </table>` : `<div class="muted">暂无 official_tool 权益数据</div>`}
        <div class="muted" style="margin-top:8px;font-size:12px">基础设施(inrastructure)权益：${(live.harness_infrastructure && live.harness_infrastructure.items?.length) ? `${live.harness_infrastructure.items.length} 项` : "无"}</div>
      </div>`;
  },

  /* ---- Tab: 免费额度 ---- */
  tabFree(body, data) {
    const free = Array.isArray(data.live?.usage_free) ? data.live.usage_free : [];
    body.innerHTML = `
      <div class="panel">
        <h3>免费额度（按到期排序）</h3>
        ${this.freeTable(free)}
      </div>`;
  },

  /* ---- Tab: 本地用量 ---- */
  tabLocal(body, data) {
    const local = data.local || {};
    body.innerHTML = `
      <div class="panel">
        <h3>本地用量分布（按模型）</h3>
        <div class="two-col">
          <div><div id="chart-models" class="chart"></div></div>
          <div>
            ${this.modelTable(local.by_model || {})}
            <div class="muted" style="margin-top:8px;font-size:12px">注：费用为本地估算，非精确计费。</div>
          </div>
        </div>
      </div>`;
    this.drawModels(local.by_model || {});
  },

  /* ---- 辅助渲染 ---- */
  providersTable(prov) {
    const rows = Object.entries(prov).map(([pid, p]) => `
      <tr>
        <td><span class="tag">${fmt.esc(p.name)}</span></td>
        <td>${p.kind === "quota" ? "配额类" : "通用 OpenAI 兼容"}</td>
        <td>${fmt.num(p.key_count)} 个 Key</td>
        <td>${(p.kinds || []).join(", ") || "—"}</td>
        <td>${p.env_configured ? `<span class="tag green">已配置</span>` : `<span class="tag amber">待填 .env</span>`}</td>
      </tr>`).join("");
    return `<table>
      <thead><tr><th>平台</th><th>类型</th><th>Key</th><th>类型明细</th><th>.env 配置</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  },

  zhipuBadge(s) {
    const map = {
      ok: ["green", "已接入"],
      error: ["red", "查询失败"],
      env_ready: ["amber", "已配 Key，待接入"],
      not_configured: ["red", "未配置"],
    };
    const [c, label] = map[s] || ["", s];
    return `<span class="tag ${c}">${label}</span>`;
  },

  zhipuStatus(zc, keyCount = 0) {
    return `<p style="margin-bottom:8px">状态：${this.zhipuBadge(zc.status || "not_configured")} · ${fmt.num(keyCount)} 个智谱 Key</p>
      <div class="muted" style="font-size:12px">${fmt.esc(zc.note || "")}</div>`;
  },

  percentBar(p) {
    const v = +(p || 0).toFixed(0);
    const color = v > 80 ? "var(--red)" : v > 50 ? "var(--amber)" : "var(--green)";
    return `<div style="display:flex;align-items:center;gap:6px">
      <div style="width:70px;height:6px;background:var(--panel2);border-radius:3px;overflow:hidden">
        <div style="width:${Math.min(v, 100)}%;height:100%;background:${color}"></div>
      </div><span>${v}%</span></div>`;
  },

  freeTable(free) {
    if (!free.length) return `<div class="muted">暂无免费额度数据</div>`;
    const sorted = [...free].sort((a, b) => (a.expires || "9999").localeCompare(b.expires || "9999"));
    const now = new Date();
    const days = (d) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;
    const rows = sorted.map((f) => {
      const dd = days(f.expires);
      let tag = `<span class="tag">${fmt.esc(f.expires)}</span>`;
      if (dd !== null && dd <= 7) tag = `<span class="tag red">${dd <= 0 ? "已到期" : `${dd}天后到期`}</span>`;
      else if (dd !== null && dd <= 30) tag = `<span class="tag amber">${dd}天后到期</span>`;
      const used = +(f.usagePercent || 0).toFixed(0);
      return `<tr>
        <td class="code">${fmt.esc(f.model)}</td>
        <td>${fmt.esc(f.type || "—")}</td>
        <td>${fmt.num(f.total)}</td>
        <td>${used > 0 ? this.percentBar(used) : `<span class="muted">0%</span>`}</td>
        <td>${tag}</td>
      </tr>`;
    }).join("");
    return `<div class="scroll" style="max-height:420px;overflow:auto">
      <table><thead><tr><th>模型</th><th>类型</th><th>额度</th><th>已用</th><th>到期</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  },

  modelTable(byModel) {
    const rows = Object.entries(byModel).sort((a, b) => b[1].tokens - a[1].tokens);
    if (!rows.length) return `<div class="muted">暂无本地调用记录，去「模型体验」发起一次调用。</div>`;
    return `<table>
      <thead><tr><th>模型</th><th>调用</th><th>Token</th><th>费用(估)</th></tr></thead>
      <tbody>${rows.map(([m, d]) => `
        <tr><td class="code">${fmt.esc(m)}</td><td>${d.calls}</td><td>${fmt.num(d.tokens)}</td><td>¥ ${d.cost}</td></tr>`).join("")}
      </tbody></table>`;
  },

  drawTokenPlan(pct, tp) {
    const el = document.getElementById("chart-tokenplan");
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption({
      title: { text: "Token Plan 配额", sub: "已用 vs 剩余", left: "center", textStyle: { color: "#e6e9ef", fontSize: 14 }, subtextStyle: { color: "#8a92a3" } },
      series: [{
        type: "pie", radius: ["55%", "78%"], center: ["50%", "58%"],
        label: { show: false },
        data: [
          { value: +(pct * 100).toFixed(1), name: "已用", itemStyle: { color: pct > 0.8 ? "#ef4444" : pct > 0.5 ? "#f59e0b" : "#3b82f6" } },
          { value: +((1 - pct) * 100).toFixed(1), name: "剩余", itemStyle: { color: "#2a2f3a" } },
        ],
      }],
      graphic: [{ type: "text", left: "center", top: "45%", style: { text: `${fmt.pct(pct)}`, fontSize: 22, fontWeight: 700, fill: "#e6e9ef" } }],
    });
  },

  drawModels(byModel) {
    const el = document.getElementById("chart-models");
    if (!el) return;
    const rows = Object.entries(byModel).sort((a, b) => b[1].tokens - a[1].tokens);
    if (!rows.length) {
      el.innerHTML = `<div class="muted" style="padding:20px">暂无数据</div>`;
      return;
    }
    const chart = echarts.init(el);
    chart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 60, right: 20, top: 20, bottom: 40 },
      xAxis: { type: "category", data: rows.map(([m]) => m), axisLabel: { color: "#8a92a3", interval: 0, rotate: rows.length > 4 ? 30 : 0 } },
      yAxis: { type: "value", name: "Token", nameTextStyle: { color: "#8a92a3" }, axisLabel: { color: "#8a92a3" }, splitLine: { lineStyle: { color: "#2a2f3a" } } },
      series: [{ type: "bar", data: rows.map(([, d]) => d.tokens), itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] }, barWidth: 24 }],
    });
  },
};
