/* 统计概览视图（多 tab：概览 / TokenPlan / Harness / 免费额度 / 智谱 / 本地用量） */
App.Views.stats = {
  TABS: [
    { id: "overview", label: "概览" },
    { id: "tokenplan", label: "Token Plan" },
    { id: "harness", label: "Harness 权益" },
    { id: "free", label: "免费额度" },
    { id: "zhipu", label: "智谱 Code Plan" },
    { id: "local", label: "本地用量" },
  ],
  _data: null,
  _active: "overview",

  // 供 app.js 在 init 前恢复上次 tab（hash 路由）
  setActiveTab(tab) {
    if (tab && this.TABS.some((t) => t.id === tab)) this._active = tab;
  },

  // 同视图内 hash 变化（#/stats/{tab}）时由 app.js 调用，只切 tab 不重拉数据
  onHash(tab) {
    this.switchTab(tab);
  },

  async init() {
    // 从 hash（#/stats/{tab}）恢复上次 tab
    const hp = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (hp[0] === "stats" && hp[1] && this.TABS.some((t) => t.id === hp[1])) this._active = hp[1];
    const el = document.getElementById("view-stats");
    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        <h2 style="font-size:20px">统计概览</h2>
        <div class="spacer"></div>
        <button class="btn" id="btn-refresh-stats">刷新（实时拉取百炼）</button>
      </div>
      <div id="stats-tabs" class="tabs"></div>
      <div id="stats-body" class="loading">加载中…</div>`;
    document.getElementById("btn-refresh-stats").onclick = () => this.load(true);
    this.load();
  },

  async load(force = false) {
    const body = document.getElementById("stats-body");
    body.innerHTML = `<div class="loading">${force ? "正在拉取百炼用量/权益数据…" : "加载统计概览…"}</div>`;
    try {
      const data = await API.get("/api/stats/overview" + (force ? "?force=true" : ""));
      this._data = data;
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
    this._active = id;
    // 同步 hash（#/stats/{id}），支持刷新恢复与分享
    const target = `#/stats/${id}`;
    if (location.hash !== target) location.hash = target;
    document.querySelectorAll("#stats-tabs .tab-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === id));
    const body = document.getElementById("stats-body");
    const data = this._data || {};
    const map = {
      overview: () => this.tabOverview(body, data),
      tokenplan: () => this.tabTokenPlan(body, data),
      harness: () => this.tabHarness(body, data),
      free: () => this.tabFree(body, data),
      zhipu: () => this.tabZhipu(body, data),
      local: () => this.tabLocal(body, data),
    };
    (map[id] || map.overview)();
  },

  /* ---- Tab: 概览 ---- */
  tabOverview(body, data) {
    const live = data.live || {}, local = data.local || {}, prov = data.providers || {};
    const tp = live.token_plan || {};
    const pct = tp.per1MonthPercentage ?? 0;
    const harnessItems = Array.isArray(live.harness_official_tool?.items) ? live.harness_official_tool.items : [];
    const zc = data.zhipu_code_plan || {};
    body.innerHTML = `
      <div class="cards">
        <div class="card">
          <h4>Token Plan 月度用量</h4>
          <div class="value ${pct > 0.8 ? "red" : pct > 0.5 ? "amber" : ""}">${fmt.pct(pct)}</div>
          <div class="sub">下次重置：${fmt.maskTime(tp.per1MonthResetTime)}</div>
        </div>
        <div class="card">
          <h4>本地累计调用</h4>
          <div class="value">${fmt.num(local.calls)}</div>
          <div class="sub">来自试画/调用记录</div>
        </div>
        <div class="card">
          <h4>本地累计 Token</h4>
          <div class="value">${fmt.num(local.total_tokens)}</div>
          <div class="sub">输入 ${fmt.num(local.input_tokens)} / 输出 ${fmt.num(local.output_tokens)}</div>
        </div>
        <div class="card">
          <h4>Harness 权益工具</h4>
          <div class="value">${harnessItems.length}</div>
          <div class="sub">official_tool 配额项</div>
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
      const names = { stats: "统计概览", keys: "Key 管理", trial: "多模型试画" };
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

  /* ---- Tab: Token Plan ---- */
  tabTokenPlan(body, data) {
    const live = data.live || {};
    const tp = live.token_plan || {};
    const sum = live.usage_summary || {};
    const pct = tp.per1MonthPercentage ?? 0;
    body.innerHTML = `
      <div class="panel">
        <h3>Token Plan 配额</h3>
        <div class="two-col">
          <div><div id="chart-tokenplan" class="chart" style="height:260px"></div></div>
          <div>
            <table>
              <tbody>
                <tr><th>业务空间</th><td class="code">${fmt.esc(live.workspace_id || "—")}</td></tr>
                <tr><th>月度已用</th><td>${fmt.pct(pct)}</td></tr>
                <tr><th>下次重置</th><td>${fmt.maskTime(tp.per1MonthResetTime)}</td></tr>
                <tr><th>近30天调用(模型)</th><td>${sum.modelsCalled ?? "—"}</td></tr>
                <tr><th>近30天成功调用</th><td>${sum.successfulCalls ?? "—"}</td></tr>
                <tr><th>统计周期</th><td>${sum.period ? `${fmt.esc(sum.period.start)} → ${fmt.esc(sum.period.end)}` : "—"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    this.drawTokenPlan(pct, tp);
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

  /* ---- Tab: 智谱 Code Plan ---- */
  tabZhipu(body, data) {
    const zc = data.zhipu_code_plan || {};
    const prov = data.providers || {};
    const zp = prov.zhipu || {};
    const periods = Array.isArray(zc.periods) ? zc.periods : [];
    let table;
    if (zc.status === "ok" && periods.length) {
      table = `<table>
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
    } else if (zc.status === "error") {
      table = `<div class="msg err">${fmt.esc(zc.note)}</div>`;
    } else {
      table = `<div class="muted" style="margin-top:10px">${fmt.esc(zc.note)}</div>`;
    }
    body.innerHTML = `
      <div class="panel">
        <h3>智谱 GLM Code Plan（bigmodel.cn）${zc.level ? ` <span class="tag">${fmt.esc(zc.level)} 套餐</span>` : ""}</h3>
        <p style="margin-bottom:8px">状态：${this.zhipuBadge(zc.status)} · ${fmt.num(zp.key_count || 0)} 个智谱 Key${zp.env_configured ? " · 已配置 .env" : ""}</p>
        ${table}
        <div class="muted" style="margin-top:12px;font-size:12px">
          套餐积分额度：Lite 每5小时 2000 / 每周 10000 · Pro 每5小时 12000 / 每周 60000 · Max 每5小时 28000 / 每周 140000。
        </div>
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
    if (!rows.length) return `<div class="muted">暂无本地调用记录，去「多模型试画」发起一次调用。</div>`;
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
