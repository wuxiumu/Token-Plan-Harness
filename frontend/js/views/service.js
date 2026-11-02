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
        <div id="s-cards" class="card-grid"></div>
      </div>`;
    const wrap = document.getElementById("s-cards");
    wrap.innerHTML = this._items.map((s) => this.card(s)).join("");
    wrap.querySelectorAll("[data-enter]").forEach((b) =>
      b.onclick = () => this.enterService(b.dataset.enter));
  },

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
      </div>`;
    document.getElementById("s-back").onclick = () => {
      const target = `#/service`;
      if (location.hash !== target) location.hash = target;
      this.renderList();
    };
    this.renderForm(s);
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
