/* Harness · MCP 服务测试中心：列表页 + 各服务独立测试页
 * 路由：#/service 列表， #/service/{serviceId} 测试页 */
App.Views.service = {
  _items: [],

  async init() {
    const el = document.getElementById("view-service");
    el.innerHTML = `<div id="s-root"></div>`;
    if (!this._items.length) {
      try { const { items } = await API.get("/api/mcp/services"); this._items = items; } catch (e) { /* 忽略 */ }
    }
    this.renderByHash();
  },

  onHash(pid) { this.renderByHash(); },

  renderByHash() {
    const hp = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const sid = hp[0] === "service" ? hp[1] : null;
    if (sid && this._items.some((s) => s.id === sid)) this.renderDetail(sid);
    else this.renderList();
  },

  renderList() {
    const root = document.getElementById("s-root");
    root.innerHTML = `
      <div class="panel">
        <h3>Harness · MCP 服务测试中心</h3>
        <p class="muted">阿里云百炼 Harness 各能力服务，点击卡片进入独立测试页，可独立操作与刷新。</p>
        <div id="s-quota" style="margin-bottom:16px"></div>
        <div id="s-global-stats" style="margin-bottom:14px"></div>
        <div id="s-cards" class="card-grid"></div>
      </div>`;
    const wrap = document.getElementById("s-cards");
    wrap.innerHTML = this._items.map((s) => this.card(s)).join("");
    wrap.querySelectorAll("[data-enter]").forEach((b) =>
      b.onclick = () => this.enterService(b.dataset.enter));
    this.renderQuota();
    this.renderGlobalStats();
  },

  async renderQuota(force) {
    const el = document.getElementById("s-quota");
    if (!el) return;
    if (force) { el.innerHTML = `<div class="muted">刷新中…</div>`; }
    let q = null;
    try { q = await API.get("/api/harness/quota?force=" + (force ? "true" : "false")); } catch (e) { q = null; }
    if (!q || !q.items || !q.items.length) { el.innerHTML = `<div class="muted">暂无 Harness 免费权益数据</div>`; return; }
    const pd = q.period || {};
    const rows = q.items.map((it) => {
      const pct = it.total ? Math.round((it.used / it.total) * 100) : 0;
      return `<div class="quota-row">
        <span class="quota-name">${fmt.esc(it.title)}</span>
        <span class="quota-bar"><i style="width:${pct}%"></i></span>
        <b class="quota-num">${it.used}/${it.total} ${fmt.esc(it.unit || "")}</b>
        <span class="quota-status ${it.used > 0 ? "" : "unused"}">${it.used > 0 ? `已用 ${pct}%` : "未使用"}</span>
      </div>`;
    }).join("");
    const periodTxt = pd.start ? `周期 ${new Date(pd.start).toLocaleDateString()} ~ ${new Date(pd.end).toLocaleDateString()}` : "";
    el.innerHTML = `<div class="quota-head">
        <h3 style="margin:0">Token Plan · Harness 免费权益</h3>
        <button class="btn ghost sm" id="s-quota-refresh">刷新</button>
      </div>
      <div class="muted" style="margin:4px 0 8px;font-size:12px">
        免费权益需通过 <b>MCP 通道</b> 调用对应服务才消耗；当前图像/联网搜索等走 DashScope 模型 API（按量计费），不计入权益。
        ${periodTxt}
      </div>
      <div class="quota-list">${rows}</div>`;
    const btn = document.getElementById("s-quota-refresh");
    if (btn) btn.onclick = () => this.renderQuota(true);
  },

  async renderGlobalStats() {
    const el = document.getElementById("s-global-stats");
    if (!el) return;
    let s = null;
    try { s = await API.get("/api/mcp/stats"); } catch (e) { s = null; }
    if (!s || !s.total) { el.innerHTML = `<div class="muted">暂无调用统计，进入服务测试后可查看统计详情</div>`; return; }
    const tk = s.tokens || {};
    const per = (s.by_service || []).map((b) =>
      `<div class="per-item"><span class="per-name">${fmt.esc(this._svName(b.service_id))}</span><b>${b.count} 次</b><span>${b.ok}/${b.count} 成功</span><span>¥${(b.cost || 0).toFixed(3)}</span><span>${(b.tokens_in || 0) + (b.tokens_out || 0)} tok</span></div>`).join("");
    el.innerHTML = `<h3 style="margin:0 0 8px">数据统计</h3>
      <div class="stat-grid">
        <div class="stat-item"><b>${s.total}</b><span>总调用</span></div>
        <div class="stat-item"><b>${s.success_rate}%</b><span>成功率</span></div>
        <div class="stat-item"><b>¥${s.total_cost}</b><span>总成本(估)</span></div>
        <div class="stat-item"><b>${tk.total || 0}</b><span>总 token</span></div>
      </div>
      <div class="per-list">${per}</div>`;
  },

  _svName(id) { const s = this._items.find((x) => x.id === id); return s ? s.name : id; },

  card(s) {
    return `<div class="card">
      <h4>${fmt.esc(s.name)} <span class="tag ${s.supported ? "blue" : ""}">${fmt.esc(s.badge)}</span></h4>
      <div class="sub" style="min-height:70px">${fmt.esc((s.desc || "").slice(0, 120))}${(s.desc || "").length > 120 ? "…" : ""}</div>
      <div class="sub muted">${fmt.esc(s.price)} · ${fmt.esc(s.quota)}</div>
      <button class="btn ${s.supported ? "" : "ghost"}" data-enter="${s.id}" ${s.supported ? "" : "disabled"}>
        ${s.supported ? "立即测试 →" : "接入中"}
      </button>
    </div>`;
  },

  enterService(id) {
    const target = `#/service/${id}`;
    if (location.hash !== target) location.hash = target;
    this.renderDetail(id);
  },

  renderDetail(id) {
    const s = this._items.find((x) => x.id === id);
    const root = document.getElementById("s-root");
    if (!s) return this.renderList();
    root.innerHTML = `
      <div class="panel">
        <div class="row" style="align-items:center;gap:10px;margin-bottom:4px">
          <button class="btn ghost" id="s-back">← 返回服务列表</button>
          <h3 style="margin:0">${fmt.esc(s.name)} · 测试</h3>
        </div>
        <p class="muted">${fmt.esc(s.desc)} · ${fmt.esc(s.price)} · ${fmt.esc(s.quota)}</p>
        <div id="s-form"></div>
        <div id="s-result" style="margin-top:12px"></div>
        <div id="s-stats" style="margin-top:18px"></div>
        <div id="s-logs" style="margin-top:18px">
          <div class="log-head">
            <h3 style="margin:0">调用日志</h3>
            <button class="btn ghost sm" id="s-logs-refresh">刷新</button>
          </div>
          <div id="s-logs-inner"></div>
        </div>
      </div>`;
    document.getElementById("s-back").onclick = () => {
      const target = `#/service`;
      if (location.hash !== target) location.hash = target;
      this.renderList();
    };
    this.renderForm(s);
    this.renderStats(s.id);
    this.renderLogs(s.id);
  },

  async renderStats(id) {
    const el = document.getElementById("s-stats");
    if (!el) return;
    el.innerHTML = `<h3>数据统计</h3><div class="loading">统计中…</div>`;
    let s = null;
    try { s = await API.get(`/api/mcp/stats?service_id=${id}`); } catch (e) { s = null; }
    if (!s || !s.total) { el.innerHTML = `<h3>数据统计</h3><div class="muted">暂无调用统计，先执行一次测试</div>`; return; }
    const tk = s.tokens || {};
    el.innerHTML = `<h3>数据统计</h3>
      <div class="stat-grid">
        <div class="stat-item"><b>${s.total}</b><span>总次数</span></div>
        <div class="stat-item"><b>${s.ok}</b><span>成功</span></div>
        <div class="stat-item"><b>${s.fail}</b><span>失败</span></div>
        <div class="stat-item"><b>${s.success_rate}%</b><span>成功率</span></div>
        <div class="stat-item"><b>${(s.total_elapsed_ms / 1000).toFixed(1)}s</b><span>总耗时</span></div>
        <div class="stat-item"><b>¥${s.total_cost}</b><span>估算成本</span></div>
        <div class="stat-item"><b>${tk.input || 0}</b><span>输入 token</span></div>
        <div class="stat-item"><b>${tk.output || 0}</b><span>输出 token</span></div>
        <div class="stat-item"><b>${tk.total || 0}</b><span>总 token</span></div>
      </div>
      <div class="muted" style="margin-top:6px;font-size:12px">成本为估算（服务基准价）；token 单独统计，未折算金额。</div>`;
  },

  renderForm(s) {
    const el = document.getElementById("s-form");
    if (!s.supported) {
      el.innerHTML = `<div class="msg err">该服务尚未接入测试通道，将在后续版本接入。当前已支持：图像生成、视频生成、联网搜索、RAG 知识库、Memory。</div>`;
      return;
    }
    const form = this.form(s);
    el.innerHTML = form || `<div class="msg err">测试表单未定义</div>`;
    if (form) document.getElementById("s-run").onclick = () => this.run(s.id);
  },

  form(s) {
    const m = (s.models || []).map((x) => `<option>${x}</option>`).join("");
    switch (s.id) {
      case "image": return `
        <label>Prompt 图像描述</label>
        <textarea id="p-prompt" placeholder="例如：一只戴着宇航服的柴犬站在火星红色沙地上，写实风格"></textarea>
        <div class="row">
          <div style="flex:1"><label>模型</label><select id="p-model">${m}</select></div>
          <div style="flex:1"><label>尺寸</label>
            <select id="p-size"><option>1:1</option><option>3:4</option><option>16:9</option><option>2048*2048</option><option>1024*1024</option></select></div>
          <div style="flex:1"><label>数量（1-6）</label><input id="p-n" type="number" value="1" min="1" max="6"></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn" id="s-run">生成图像</button></div>`;
      case "video": return `
        <label>Prompt 视频描述</label>
        <textarea id="p-prompt" placeholder="例如：一只宇航员在火星上散步，缓慢航拍镜头"></textarea>
        <div class="row">
          <div style="flex:1"><label>模型</label><select id="p-model">${m}</select></div>
          <div style="flex:1"><label>宽高比</label><select id="p-ratio"><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option><option>3:4</option></select></div>
          <div style="flex:1"><label>时长(秒)</label><input id="p-duration" type="number" value="5" min="4" max="15"></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn" id="s-run">生成视频</button></div>`;
      case "web_search": return `
        <label>搜索关键词</label>
        <input id="p-query" placeholder="例如：2026 年诺贝尔物理学奖得主是谁"></input>
        <div class="row">
          <div style="flex:1"><label>结果数</label><input id="p-count" type="number" value="5" min="1" max="20"></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn" id="s-run">联网搜索</button></div>`;
      case "rag": return `
        <label>知识库检索 / 问答</label>
        <textarea id="p-query" placeholder="向你的私有知识库提问"></textarea>
        <div class="row">
          <div style="flex:1"><label>问答服务 ID（agent-id，必填）</label><input id="p-kb" placeholder="控制台「知识库问答」页获取"></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn" id="s-run">知识库问答</button></div>`;
      case "memory": return `
        <label>记忆检索关键词</label>
        <input id="p-query" placeholder="例如：用户的偏好"></input>
        <div class="row">
          <div style="flex:1"><label>用户 ID（必填）</label><input id="p-user" placeholder="例如：user1"></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn" id="s-run">检索记忆</button></div>`;
      default: return null;
    }
  },

  collectParams(id) {
    const p = {};
    const v = (n) => { const e = document.getElementById(n); return e ? e.value.trim() : ""; };
    p.prompt = v("p-prompt");
    p.query = v("p-query");
    if (document.getElementById("p-model")) p.model = v("p-model");
    if (document.getElementById("p-size")) p.size = v("p-size");
    if (document.getElementById("p-n")) p.n = parseInt(v("p-n"), 10) || 1;
    if (document.getElementById("p-ratio")) p.ratio = v("p-ratio");
    if (document.getElementById("p-duration")) p.duration = parseInt(v("p-duration"), 10) || 5;
    if (document.getElementById("p-count")) p.count = parseInt(v("p-count"), 10) || 5;
    if (document.getElementById("p-kb")) p.knowledge_base_id = v("p-kb");
    if (document.getElementById("p-user")) p.user_id = v("p-user");
    return p;
  },

  async run(id) {
    const result = document.getElementById("s-result");
    result.innerHTML = `<div class="loading">调用中…（图像/视频生成可能需要数十秒）</div>`;
    try {
      const data = await API.post(`/api/mcp/${id}`, this.collectParams(id));
      result.innerHTML = this.renderResult(id, data);
    } catch (e) {
      result.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`;
    }
    this.renderLogs(id);
  },

  async renderLogs(id) {
    const inner = document.getElementById("s-logs-inner");
    const refresh = document.getElementById("s-logs-refresh");
    if (!inner) return;
    if (refresh) refresh.onclick = () => this.renderLogs(id);
    inner.innerHTML = `<div class="loading">加载日志…</div>`;
    let items = [];
    try { const d = await API.get(`/api/mcp/logs?service_id=${id}`); items = d.items || []; } catch (e) { items = []; }
    this._lastLogs = items;
    if (!items.length) { inner.innerHTML = `<div class="muted">暂无调用记录，先执行一次测试</div>`; return; }
    inner.innerHTML = items.map((r) => this.logRow(r)).join("");
    inner.querySelectorAll("[data-log]").forEach((b) =>
      b.onclick = () => this.showLogDetail(b.dataset.log));
  },

  logRow(r) {
    const t = new Date(r.created_at).toLocaleTimeString();
    const inSum = (r.params && JSON.stringify(r.params)) || "";
    return `<div class="log-row ${r.ok ? "" : "err"}" data-log="${r.id}">
      <span class="log-status ${r.ok ? "ok" : "err"}">${r.ok ? "成功" : "失败"}</span>
      <span class="log-time">${t}</span>
      <span class="log-ms">${r.elapsed_ms}ms</span>
      <span class="log-cost">¥${((r.cost || 0)).toFixed(4)}</span>
      <span class="log-in muted">${fmt.esc(inSum.slice(0, 70))}${inSum.length > 70 ? "…" : ""}</span>
    </div>`;
  },

  showLogDetail(id) {
    const r = (this._lastLogs || []).find((x) => x.id === id);
    if (!r) return;
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `<div class="modal">
      <div class="modal-head">
        <b>${fmt.esc(r.name)} · 调用日志详情</b>
        <span class="modal-close">×</span>
      </div>
      <div class="modal-meta">${new Date(r.created_at).toLocaleString()} · 耗时 ${r.elapsed_ms}ms · ${r.ok ? "成功" : "失败"}</div>
      <div class="modal-body">
        <h4>输入参数</h4>
        <pre>${fmt.esc(JSON.stringify(r.params || {}, null, 2))}</pre>
        <h4>输出</h4>
        <pre>${fmt.esc(JSON.stringify(r.output || {}, null, 2))}</pre>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector(".modal-close").onclick = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  },

  renderResult(id, data) {
    if (data && data.error) {
      return `<div class="msg err">${fmt.esc(data.error)}${data.raw ? ` · ${fmt.esc((data.raw || "").slice(0, 200))}` : ""}</div>`;
    }
    switch (id) {
      case "image": {
        const urls = (data && (data.urls || [])) || [];
        if (!urls.length) return `<div class="msg err">未返回图片。${fmt.esc((data.raw || data || "").toString().slice(0, 300))}</div>`;
        return `<h3>生成 ${data.total || urls.length} 张</h3>` +
          urls.map((u) => `<img src="${u}" style="max-width:100%;border-radius:8px;margin-bottom:8px;display:block">`).join("");
      }
      case "video": {
        const urls = (data && (data.urls || [])) || [];
        if (!urls.length) return `<div class="msg err">未返回视频。${fmt.esc(JSON.stringify(data || "").slice(0, 300))}</div>`;
        return `<video src="${urls[0]}" controls style="max-width:100%;border-radius:8px"></video>`;
      }
      case "web_search": {
        if (data && data.content) {
          return `<h3>联网搜索回答</h3><div class="panel2"><pre style="white-space:pre-wrap">${fmt.esc(data.content)}</pre></div>`;
        }
        const items = (data && (data.results || data.items || [])) || [];
        if (!items.length) return `<div class="msg err">无结果。${fmt.esc(JSON.stringify(data || "").slice(0, 300))}</div>`;
        return `<h3>${items.length} 条结果</h3><ol>${items.map((r) =>
          `<li><b>${fmt.esc(r.title || r.name || "")}</b><br><span class="muted">${fmt.esc((r.snippet || r.description || "").slice(0, 200))}</span><br><span class="code">${fmt.esc(r.url || r.link || "")}</span></li>`).join("")}</ol>`;
      }
      case "rag":
      case "memory": {
        const txt = data && (data.content || data.answer || data.message || data.output_text);
        return `<div class="panel2"><pre style="white-space:pre-wrap">${fmt.esc(txt || JSON.stringify(data || "", null, 2).slice(0, 1500))}</pre></div>`;
      }
      default: return `<div class="msg err">未识别的结果：${fmt.esc(JSON.stringify(data || "").slice(0, 300))}</div>`;
    }
  },
};
