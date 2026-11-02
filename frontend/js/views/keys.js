/* Key 管理视图 */
App.Views.keys = {
  async init() {
    const el = document.getElementById("view-keys");
    el.innerHTML = `
      <div class="panel">
        <h3>Key 管理</h3>
        <div class="row" style="margin-bottom:14px">
          <button class="btn" id="btn-new-key">+ 新增 Key</button>
          <button class="btn ghost" id="btn-refresh-keys">刷新</button>
          <span class="muted" id="key-count"></span>
        </div>
        <div id="key-form-wrap" style="display:none"></div>
        <table>
          <thead><tr>
            <th>名称</th><th>类型</th><th>Key(掩码)</th><th>模型</th>
            <th>状态</th><th>到期</th><th>备注</th><th>操作</th>
          </tr></thead>
          <tbody id="key-tbody"></tbody>
        </table>
      </div>`;
    document.getElementById("btn-new-key").onclick = () => this.showForm(null);
    document.getElementById("btn-refresh-keys").onclick = () => this.load();
    this.load();
  },

  async load() {
    const tb = document.getElementById("key-tbody");
    tb.innerHTML = `<tr><td colspan="8" class="loading">加载中…</td></tr>`;
    try {
      const { items } = await API.get("/api/keys");
      document.getElementById("key-count").textContent = `共 ${items.length} 条`;
      if (!items.length) {
        tb.innerHTML = `<tr><td colspan="8" class="muted">暂无 Key，点「+ 新增 Key」或重启后端自动导入百炼默认 Key</td></tr>`;
        return;
      }
      tb.innerHTML = items.map((k) => `
        <tr>
          <td>${fmt.esc(k.name)}</td>
          <td>${fmt.esc(k.kind)}</td>
          <td><span class="code">${fmt.esc(k.api_key)}</span></td>
          <td>${(k.models || []).slice(0, 3).map((m) => `<span class="tag">${fmt.esc(m)}</span>`).join(" ") || "—"}</td>
          <td>${statusTag(k.status)}</td>
          <td>${fmt.esc(k.expire_at || "—")}</td>
          <td title="${fmt.esc(k.note)}">${fmt.esc((k.note || "").slice(0, 12))}</td>
          <td>
            <button class="btn ghost sm" data-edit="${k.id}">编辑</button>
            <button class="btn danger sm" data-del="${k.id}">删除</button>
          </td>
        </tr>`).join("");
      tb.querySelectorAll("[data-edit]").forEach((b) =>
        b.onclick = () => this.showForm(b.dataset.edit));
      tb.querySelectorAll("[data-del]").forEach((b) =>
        b.onclick = () => this.del(b.dataset.del));
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="8" class="msg err">${fmt.esc(e.message)}</td></tr>`;
    }
  },

  async del(id) {
    if (!confirm("确认删除该 Key？")) return;
    try {
      await API.del(`/api/keys/${id}`);
      this.load();
    } catch (e) { alert(e.message); }
  },

  async showForm(id) {
    const wrap = document.getElementById("key-form-wrap");
    let data = { name: "", kind: "dashscope", api_key: "", base_url: "",
                  workspace_id: "", models: [], note: "", status: "active", expire_at: "" };
    if (id) {
      const { items } = await API.get("/api/keys");
      data = items.find((k) => k.id === id) || data;
    }
    wrap.style.display = "block";
    wrap.innerHTML = `
      <div class="panel2" style="background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:14px">
        <h4 style="margin-bottom:12px">${id ? "编辑 Key" : "新增 Key"}</h4>
        <div class="form-grid">
          <div><label>名称</label><input id="f-name" value="${fmt.esc(data.name)}"></div>
          <div><label>类型</label>
            <select id="f-kind">
              ${["dashscope", "token_plan", "other"].map((t) =>
                `<option ${data.kind === t ? "selected" : ""}>${t}</option>`).join("")}
            </select></div>
          <div class="full"><label>API Key（明文，仅本地存储）</label>
            <input id="f-apikey" value="${fmt.esc(data.api_key)}" placeholder="sk-..."></div>
          <div><label>Base URL</label><input id="f-base" value="${fmt.esc(data.base_url || "")}" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"></div>
          <div><label>Workspace ID</label><input id="f-wsid" value="${fmt.esc(data.workspace_id || "")}"></div>
          <div><label>状态</label>
            <select id="f-status">${["active", "disabled", "expired"].map((t) =>
              `<option ${data.status === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div><label>到期时间</label><input id="f-expire" value="${fmt.esc(data.expire_at || "")}" placeholder="YYYY-MM-DD"></div>
          <div class="full"><label>备注</label><textarea id="f-note">${fmt.esc(data.note || "")}</textarea></div>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="f-save">保存</button>
          <button class="btn ghost" id="f-cancel">取消</button>
        </div>
      </div>`;
    document.getElementById("f-save").onclick = async () => {
      const body = {
        name: v("f-name"), kind: v("f-kind"), api_key: v("f-apikey"),
        base_url: v("f-base") || null, workspace_id: v("f-wsid") || null,
        status: v("f-status"), expire_at: v("f-expire") || null, note: v("f-note"),
      };
      try {
        if (id) await API.put(`/api/keys/${id}`, body);
        else await API.post("/api/keys", body);
        wrap.style.display = "none";
        this.load();
      } catch (e) { alert(e.message); }
    };
    document.getElementById("f-cancel").onclick = () => { wrap.style.display = "none"; };
  },
};

function v(id) { return document.getElementById(id).value.trim(); }
function statusTag(s) {
  const map = { active: ["green", "可用"], disabled: ["amber", "停用"], expired: ["red", "到期"] };
  const [c, label] = map[s] || ["", s];
  return `<span class="tag ${c}">${label}</span>`;
}
