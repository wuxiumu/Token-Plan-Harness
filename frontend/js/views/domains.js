/* Simple domain health monitor with a Markdown configuration editor. */
App.Views.domains = {
  _timer: null,
  async init() {
    const root = document.getElementById('view-domains');
    root.innerHTML = `<div class="domain-page"><div class="domain-hero"><div><span>五棵松工作台 / NETWORK</span><h2>域名健康监控</h2><p>一眼看到网站是否正常，异常时及时提醒。</p></div><span class="domain-pulse">●</span></div><div class="domain-toolbar"><button class="btn" id="domain-check">立即检查</button><button class="btn ghost" id="domain-edit">编辑配置</button><span id="domain-status" role="status"></span></div><section id="domain-cards" class="domain-cards"></section><section id="domain-editor" class="domain-editor" hidden><div class="row"><h3>监控域名配置</h3><div class="spacer"></div><button class="btn ghost sm" id="domain-cancel">取消</button><button class="btn sm" id="domain-save">保存</button></div><p class="muted">使用 Markdown 列表，每行一个域名。默认已配置 baidu.com 和 qq.com。</p><textarea id="domain-markdown" spellcheck="false" aria-label="Markdown 域名配置" placeholder="# 监控域名\n\n- baidu.com\n- qq.com"></textarea><p id="domain-error" class="msg err" hidden></p></section></div>`;
    const editor = root.querySelector('#domain-editor');
    const loadConfig = async () => { const d = await API.get('/api/domains'); root.querySelector('#domain-markdown').value = d.markdown || ''; };
    root.querySelector('#domain-edit').onclick = async () => { try { await loadConfig(); editor.hidden = false; root.querySelector('#domain-markdown').focus(); } catch (e) { root.querySelector('#domain-status').textContent = e.message; } };
    root.querySelector('#domain-cancel').onclick = () => { editor.hidden = true; root.querySelector('#domain-error').hidden = true; };
    root.querySelector('#domain-save').onclick = async () => {
      const error = root.querySelector('#domain-error'); const btn = root.querySelector('#domain-save'); btn.disabled = true; error.hidden = true;
      try { await API.put('/api/domains', {markdown: root.querySelector('#domain-markdown').value}); editor.hidden = true; await this.loadHealth(true); }
      catch (e) { error.textContent = e.message; error.hidden = false; } finally { btn.disabled = false; }
    };
    root.querySelector('#domain-check').onclick = () => this.loadHealth(true);
    await this.loadHealth(false);
    clearInterval(this._timer); this._timer = setInterval(() => { if (!document.hidden && document.getElementById('view-domains')?.classList.contains('active')) this.loadHealth(false); }, 60000);
  },
  onHash() { this.init(); },
  async loadHealth(force) {
    const root = document.getElementById('view-domains'); if (!root) return;
    const status = root.querySelector('#domain-status'); const cards = root.querySelector('#domain-cards');
    if (force) status.textContent = '检查中…';
    try {
      const d = await API.get('/api/domains/health' + (force ? '?force=true' : ''));
      const up = d.items.filter(x => x.status === 'up').length;
      status.textContent = `${up}/${d.items.length} 正常 · ${d.cached ? '缓存检查' : '刚刚检查'}`;
      cards.innerHTML = d.items.map(item => `<article class="domain-card ${item.status === 'up' ? 'is-up' : 'is-down'}"><div class="domain-card-top"><span class="domain-state">${item.status === 'up' ? '正常' : '异常'}</span><span>${item.status_code || '—'}</span></div><h3>${fmt.esc(item.domain)}</h3><div class="domain-latency">${item.status === 'up' ? `<strong>${item.latency_ms} ms</strong><span>响应正常</span>` : `<strong>无法访问</strong><span>${fmt.esc(item.error || '检查失败')}</span>`}</div><footer>检查于 ${fmt.esc(new Date(item.checked_at * 1000).toLocaleString('zh-CN'))}</footer></article>`).join('') || '<div class="panel">还没有配置监控域名。</div>';
    } catch (e) { status.textContent = '监控服务暂时不可用'; cards.innerHTML = `<div class="msg err">${fmt.esc(e.message)}</div>`; }
  }
};
