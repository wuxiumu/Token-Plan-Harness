/* 多模型试画视图 */
/* 新手友好的 Demo 场景：点击自动填入 prompt 并切换推荐模型 */
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
  async init() {
    const el = document.getElementById("view-trial");
    el.innerHTML = `
      <div class="panel">
        <h3>多模型试画</h3>
        <div class="row" style="margin-bottom:12px">
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
          <thead><tr><th>时间</th><th>模型</th><th>Prompt</th><th>Token</th><th>状态</th></tr></thead>
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
        const m = document.getElementById("t-model");
        if ([...m.options].some((o) => o.value === d.model)) m.value = d.model;
        document.getElementById("t-result").innerHTML = "";
        document.getElementById("t-status").textContent = `已填入「${d.label}」· 推荐模型 ${d.model}`;
      });
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
