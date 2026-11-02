/* 多模型试画视图 */
App.Views.trial = {
  async init() {
    const el = document.getElementById("view-trial");
    el.innerHTML = `
      <div class="panel">
        <h3>多模型试画</h3>
        <div class="row" style="margin-bottom:12px">
          <div style="flex:1;min-width:200px"><label>选择 Key</label><select id="t-key"></select></div>
          <div style="flex:1;min-width:200px"><label>选择模型</label><select id="t-model"></select></div>
        </div>
        <label>Prompt / 消息</label>
        <textarea id="t-prompt" placeholder="例如：用 200 字介绍量子计算，最后用一句话总结"></textarea>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="t-send">发送</button>
          <span class="muted" id="t-status"></span>
        </div>
        <div id="t-result" style="margin-top:12px"></div>
      </div>

      <div class="panel">
        <h3>试画记录</h3>
        <table>
          <thead><tr><th>时间</th><th>模型</th><th>Prompt</th><th>Token</th><th>状态</th></tr></thead>
          <tbody id="t-history"></tbody>
        </table>
      </div>`;
    document.getElementById("t-send").onclick = () => this.send();
    await this.loadMeta();
    this.loadHistory();
  },

  async loadMeta() {
    try {
      const [{ items }, { models }] = await Promise.all([
        API.get("/api/keys"), API.get("/api/trial/models"),
      ]);
      const keySel = document.getElementById("t-key");
      keySel.innerHTML = items.map((k) =>
        `<option value="${k.id}">${fmt.esc(k.name)} (${fmt.esc(k.api_key)})</option>`).join("") ||
        `<option value="">请先在 Key 管理中添加 Key</option>`;
      const modelSel = document.getElementById("t-model");
      modelSel.innerHTML = models.map((m) => `<option>${fmt.esc(m)}</option>`).join("");
      if (items.length === 0) {
        document.getElementById("t-send").disabled = true;
        document.getElementById("t-status").textContent = "无可用 Key，先到 Key 管理添加。";
      }
    } catch (e) {
      document.getElementById("t-status").textContent = e.message;
    }
  },

  async send() {
    const keyId = document.getElementById("t-key").value;
    const model = document.getElementById("t-model").value;
    const prompt = document.getElementById("t-prompt").value.trim();
    const res = document.getElementById("t-result");
    if (!keyId || !model || !prompt) {
      res.innerHTML = `<div class="msg err">请填写 Key、模型和 Prompt</div>`;
      return;
    }
    const status = document.getElementById("t-status");
    status.textContent = "调用中…";
    res.innerHTML = `<div class="msg ok">${fmt.esc(prompt)}</div><div class="loading">模型响应中…</div>`;
    try {
      const data = await API.post("/api/trial/chat", {
        key_id: keyId, model,
        messages: [{ role: "user", content: prompt }],
      });
      if (!data.success) throw new Error(data.error || "调用失败");
      const u = data.usage || {};
      res.innerHTML = `
        <div class="msg ok">${fmt.esc(prompt)}</div>
        <div class="chat-box" style="margin-top:10px">
          <div class="chat-msg"><div class="who">${fmt.esc(model)} · 输入 ${u.prompt_tokens ?? 0} / 输出 ${u.completion_tokens ?? 0} token · 估费 ¥${data.cost_yuan}</div>
          <div class="body">${fmt.esc(data.response)}</div></div>
        </div>`;
      status.textContent = "完成";
      this.loadHistory();
    } catch (e) {
      res.innerHTML += `<div class="msg err">${fmt.esc(e.message)}</div>`;
      status.textContent = "失败";
    }
  },

  async loadHistory() {
    const tb = document.getElementById("t-history");
    try {
      const { items } = await API.get("/api/trial/records");
      if (!items.length) { tb.innerHTML = `<tr><td colspan="5" class="muted">暂无记录</td></tr>`; return; }
      tb.innerHTML = items.map((r) => `
        <tr>
          <td>${fmt.maskTime(r.created_at)}</td>
          <td class="code">${fmt.esc(r.model)}</td>
          <td title="${fmt.esc(r.prompt)}">${fmt.esc((r.prompt || "").slice(0, 40))}</td>
          <td>${r.usage ? ((r.usage.prompt_tokens || 0) + (r.usage.completion_tokens || 0)) : "—"}</td>
          <td>${r.success ? `<span class="tag green">成功</span>` : `<span class="tag red">失败</span>`}</td>
        </tr>`).join("");
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="5" class="msg err">${fmt.esc(e.message)}</td></tr>`;
    }
  },
};
