/* 多模型试画视图（多 Provider：按平台选 Key + 模型） */
/* 新手友好的 Demo 场景：点击自动填入 prompt 并切换到推荐平台/模型 */
const TRIAL_DEMOS = [
  { label: "🎯 通俗讲概念", prompt: "用 3 句话 + 生活比喻，向完全不懂技术的人解释什么是「神经网络」。", model: "qwen3.8-max" },
  { label: "🌍 中英日互译", prompt: "把这句话翻译成英文和日文，保留原意：\n「工欲善其事，必先利其器。」", model: "qwen3.8-max" },
  { label: "💻 写小工具", prompt: "用 Python 写一个函数：输入字符串列表，返回按长度从短到长排序后的新列表，附简单注释。", model: "qwen3.8-max" },
  { label: "📖 故事续写", prompt: "续写下面的开头，写一个 300 字的小故事，要有反转：\n「深夜的地铁站，最后一班列车缓缓进站，车门打开，里面却空无一人……」", model: "deepseek-r1" },
  { label: "🧑‍💼 模拟面试官", prompt: "扮演资深前端技术面试官，先问我 3 个由浅入深的问题，再告诉我每题的考察点和理想答案要点。", model: "deepseek-r1" },
  { label: "✍️ 文案改三种语气", prompt: "把下面的话分别改写成「正式公文」「轻松口语」「网络俏皮」三种语气：\n「我们下周发布新版本，新增了更多 AI 功能，欢迎体验。」", model: "qwen3.8-max" },
  { label: "🧠 脑筋急转弯", prompt: "出一个中等难度的脑筋急转弯，先给答案，再逐步给出推理过程。", model: "deepseek-r1" },
  { label: "🍃 藏头诗", prompt: "写一首七言藏头诗，每句首字连起来是「豆包智能」，主题自定。", model: "qwen3.8-max" },
  { label: "🔍 逻辑推理题", prompt: "分析这道逻辑题并给出结论：\n「三个盒子分别贴着『苹果』『橘子』『苹果和橘子』的标签，但所有标签都贴错了。只允许打开一个盒子、看一个水果，如何判断三个盒子的真实内容？」", model: "deepseek-r1" },
  { label: "📧 写英文邮件", prompt: "帮我写一封礼貌的英文请假邮件给主管，理由合理，语气正式但不生硬。", model: "qwen3.8-max" },
];

App.Views.trial = {
  _providers: [],
  _keys: [],
  _models: [],

  async init() {
    const el = document.getElementById("view-trial");
    el.innerHTML = `
      <div class="panel">
        <h3>多模型试画</h3>
        <div class="row" style="margin-bottom:12px">
          <div style="flex:1;min-width:150px"><label>选择平台</label><select id="t-provider"></select></div>
          <div style="flex:1;min-width:200px"><label>选择 Key</label><select id="t-key"></select></div>
          <div style="flex:1;min-width:200px"><label>选择模型</label><select id="t-model"></select></div>
        </div>
        <label>🎯 Demo 场景（点一下自动填好，新手友好）</label>
        <div id="t-demos" class="row" style="margin-bottom:10px;gap:6px"></div>
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
          <thead><tr><th>时间</th><th>平台</th><th>模型</th><th>Prompt</th><th>Token</th><th>状态</th></tr></thead>
          <tbody id="t-history"></tbody>
        </table>
      </div>`;
    document.getElementById("t-send").onclick = () => this.send();
    this.renderDemos();
    await this.loadMeta();
    this.loadHistory();
  },

  renderDemos() {
    const wrap = document.getElementById("t-demos");
    wrap.innerHTML = TRIAL_DEMOS.map((d, i) =>
      `<button class="btn ghost sm" data-demo="${i}">${fmt.esc(d.label)}</button>`).join("");
    wrap.querySelectorAll("[data-demo]").forEach((b) =>
      b.onclick = () => {
        const d = TRIAL_DEMOS[+b.dataset.demo];
        document.getElementById("t-prompt").value = d.prompt;
        const provId = this._findProviderOfModel(d.model);
        if (provId) {
          const ps = document.getElementById("t-provider");
          if ([...ps.options].some((o) => o.value === provId)) ps.value = provId;
          this.refreshKeyModel();
          const m = document.getElementById("t-model");
          if ([...m.options].some((o) => o.value === d.model)) m.value = d.model;
        }
        document.getElementById("t-result").innerHTML = "";
        document.getElementById("t-status").textContent =
          `已填入「${d.label}」· 推荐平台 ${provId || "当前"} / 模型 ${d.model}`;
      });
  },

  _findProviderOfModel(model) {
    for (const k of this._keys) {
      if ((k.models || []).includes(model)) return k.provider;
    }
    return null;
  },

  async loadMeta() {
    try {
      const [prov, keysRes, modelsRes] = await Promise.all([
        API.get("/api/providers"), API.get("/api/keys"), API.get("/api/trial/models"),
      ]);
      this._providers = prov.providers;
      this._keys = keysRes.items;
      this._models = modelsRes.models;
      const ps = document.getElementById("t-provider");
      ps.innerHTML = `<option value="">全部平台</option>` +
        this._providers.map((p) => `<option value="${p.id}">${fmt.esc(p.name)}</option>`).join("");
      ps.onchange = () => this.refreshKeyModel();
      this.refreshKeyModel();
    } catch (e) {
      document.getElementById("t-status").textContent = e.message;
    }
  },

  refreshKeyModel() {
    const pid = document.getElementById("t-provider").value;
    const keys = pid ? this._keys.filter((k) => k.provider === pid) : this._keys;
    const keySel = document.getElementById("t-key");
    keySel.innerHTML = keys.map((k) =>
      `<option value="${k.id}">${fmt.esc(k.name)} (${fmt.esc(k.api_key)})</option>`).join("") ||
      `<option value="">请先在 Key 管理添加该平台 Key</option>`;
    const models = new Set();
    keys.forEach((k) => (k.models || []).forEach((m) => models.add(m)));
    this._models.forEach((m) => models.add(m));
    const modelSel = document.getElementById("t-model");
    modelSel.innerHTML = [...models].map((m) => `<option>${fmt.esc(m)}</option>`).join("");
    if (keys.length === 0) {
      document.getElementById("t-send").disabled = true;
      document.getElementById("t-status").textContent = "无可用 Key，先到 Key 管理添加。";
    } else {
      document.getElementById("t-send").disabled = false;
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
      if (!items.length) { tb.innerHTML = `<tr><td colspan="6" class="muted">暂无记录</td></tr>`; return; }
      // 平台映射：从 key_id 找 key 的 provider
      const idToProv = {};
      this._keys.forEach((k) => { idToProv[k.id] = k.provider; });
      tb.innerHTML = items.map((r) => `
        <tr>
          <td>${fmt.maskTime(r.created_at)}</td>
          <td><span class="tag">${fmt.esc(this.providerName(idToProv[r.key_id]))}</span></td>
          <td class="code">${fmt.esc(r.model)}</td>
          <td title="${fmt.esc(r.prompt)}">${fmt.esc((r.prompt || "").slice(0, 40))}</td>
          <td>${r.usage ? ((r.usage.prompt_tokens || 0) + (r.usage.completion_tokens || 0)) : "—"}</td>
          <td>${r.success ? `<span class="tag green">成功</span>` : `<span class="tag red">失败</span>`}</td>
        </tr>`).join("");
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="6" class="msg err">${fmt.esc(e.message)}</td></tr>`;
    }
  },

  providerName(pid) {
    const p = this._providers.find((x) => x.id === pid);
    return p ? p.name : pid || "—";
  },
};
