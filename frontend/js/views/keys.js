/* Account management: all providers support independent API or manual membership records. */
const KIND_BY_PROVIDER = {aliyun:['token_plan','dashscope','manual'], zhipu:['code_plan','general','manual'],codex:['manual'],kimi:['general','manual'],openai:['general','manual'],deepseek:['general','manual'],grok:['management','general','manual'],gemini:['general','manual'],claude:['general','manual']};
const KIND_LABELS = {token_plan:'Token Plan',dashscope:'通用 API',code_plan:'Code Plan',general:'通用 API',manual:'会员 · 手工记录',harness:'Harness',other:'其他',management:'xAI 管理 API 费用'};
App.Views.keys = {
  _providers:[], _items:[],
  async init(){
    document.getElementById('view-keys').innerHTML=`<div class="panel"><div class="row"><h2>账号管理</h2><div class="spacer"></div><button class="btn" id="btn-new-key">＋ 添加账号</button></div><p class="muted">优先从 .env 初始化，也可以直接添加。同一平台支持多个账号；页面修改后重启仍保留。</p><div class="row" style="margin:16px 0"><input id="account-search" placeholder="搜索账号名称或平台" aria-label="搜索账号"><button class="btn ghost" id="btn-refresh-keys">刷新</button><span id="key-count" class="muted"></span></div><div id="key-form-wrap" hidden></div><div class="account-list" id="account-list"></div></div>`;
    try{this._providers=(await API.get('/api/providers')).providers;}catch(e){document.getElementById('account-list').textContent=e.message;return;}
    document.getElementById('btn-new-key').onclick=()=>this.showForm();
    document.getElementById('btn-refresh-keys').onclick=()=>this.load();
    document.getElementById('account-search').oninput=()=>this.renderList();
    await this.load();
    const id=location.hash.split('/')[2]; if(id)this.showForm(id);
  },
  onHash(id){if(id)this.showForm(id);},
  providerName(id){return this._providers.find(p=>p.id===id)?.name||id;},
  async load(){try{this._items=(await API.get('/api/keys?force=true')).items;this.renderList();}catch(e){document.getElementById('account-list').textContent=e.message;}},
  renderList(){
    const q=document.getElementById('account-search').value.toLowerCase();
    const items=this._items.filter(k=>(k.name+this.providerName(k.provider)).toLowerCase().includes(q));
    document.getElementById('key-count').textContent=`${items.length} 个账号`;
    const list=document.getElementById('account-list');
    list.innerHTML=items.map(k=>`<article class="account-item"><div><span class="tag">${fmt.esc(this.providerName(k.provider))}</span> <span class="muted">${fmt.esc(KIND_LABELS[k.kind]||k.kind)}</span><h3>${fmt.esc(k.name)}</h3><p class="code">${k.kind==='manual'?'手工记录 · 已用 '+(k.used_percent==null?'未填写':fmt.esc(k.used_percent)+'%'):fmt.esc(k.api_key)}</p><small class="muted">${k.source&&k.source!=='manual'?'从 .env 初始化':'本地保存'} · ${k.status==='active'?'已启用':k.status==='disabled'?'已停用':'已过期'}</small></div><div class="row"><button class="btn ghost sm" data-edit="${fmt.esc(k.id)}">编辑</button><button class="btn danger sm" data-del="${fmt.esc(k.id)}">删除</button></div></article>`).join('')||'<p class="empty">没有账号。点击「添加账号」即可开始，无需编辑配置文件。</p>';
    list.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>this.showForm(b.dataset.edit));
    list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('删除此账号？现有调用历史会保留，重启不会从 .env 自动恢复。'))return;try{await API.del('/api/keys/'+b.dataset.del);await this.load();}catch(e){alert(e.message);}});
  },
  showForm(id){
    const original=this._items.find(k=>k.id===id);
    if(id&&!original)return;
    const d=original||{provider:'aliyun',kind:'token_plan',name:'',status:'active',models:[]};
    const wrap=document.getElementById('key-form-wrap');wrap.hidden=false;
    wrap.innerHTML=`<form id="account-form" class="panel2 account-form"><h3>${id?'编辑账号':'添加账号'}</h3><div class="form-grid"><label>账号名称<input id="f-name" required value="${fmt.esc(d.name)}" placeholder="例如：公司百炼、我的 Codex"></label><label>平台<select id="f-provider">${this._providers.map(p=>`<option value="${p.id}" ${p.id===d.provider?'selected':''}>${fmt.esc(p.name)}</option>`).join('')}</select></label><label>接入方式<select id="f-kind"></select></label><label>状态<select id="f-status">${[['active','启用'],['disabled','停用'],['expired','过期']].map(([v,l])=>`<option value="${v}" ${d.status===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div id="api-fields"><label>API Key${id?'（留空保留原密钥）':''}<input id="f-apikey" type="password" autocomplete="new-password" placeholder="${id?'不修改密钥可留空':'粘贴此账号的 API Key'}"></label><p class="muted" id="account-help"></p></div><div id="manual-fields" class="form-grid"><label>已用额度 %<input id="f-used" type="number" min="0" max="100" step="any" value="${d.used_percent??''}" placeholder="可留空"></label><label>重置时间<input id="f-reset" type="datetime-local"></label><p class="muted">手工记录不会自动查询。会员与开发者 API 分开统计；本机 Codex/Kimi 当前登录仍可在首页选择自动模块。</p></div><details><summary>更多设置（可选）</summary><div class="form-grid"><label>展示位置<select id="f-scope"><option value="all" ${d.trial_only?'':'selected'}>首页与配额可选</option><option value="trial" ${d.trial_only?'selected':''}>仅模型体验</option></select></label><label>API 地址<input id="f-base" value="${fmt.esc(d.base_url||'')}"></label><label>工作空间 / xAI 团队 ID<input id="f-wsid" value="${fmt.esc(d.workspace_id||'')}"></label><label>到期时间<input id="f-expire" type="date" value="${fmt.esc((d.expire_at||'').slice(0,10))}"></label><label>模型名称（逗号分隔）<input id="f-models" value="${fmt.esc((d.models||[]).join(', '))}"></label><label>备注<input id="f-note" value="${fmt.esc(d.note||'')}"></label></div></details><div class="row"><button class="btn" type="submit">保存账号</button><button class="btn ghost" type="button" id="f-cancel">取消</button><span id="account-error" role="status"></span></div></form>`;
    if(d.resets_at){const dt=new Date(d.resets_at);if(!isNaN(dt))document.getElementById('f-reset').value=new Date(dt-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);}
    const kinds=()=>{const pid=v('f-provider');document.getElementById('f-kind').innerHTML=(KIND_BY_PROVIDER[pid]||['general','manual']).map(k=>`<option value="${k}">${KIND_LABELS[k]}</option>`).join('');};
    const mode=()=>{const manual=v('f-kind')==='manual';document.getElementById('api-fields').hidden=manual;document.getElementById('manual-fields').hidden=!manual;document.getElementById('f-apikey').required=!manual&&!id;document.getElementById('account-help').textContent=v('f-kind')==='management'?'填写 xAI 管理密钥，并在更多设置中填写团队 ID。':v('f-kind')==='token_plan'?'Token Plan Key 可用于调用；自动查询配额还需要此账号的控制台授权。':v('f-kind')==='code_plan'?'请填写智谱 Code Plan 专用 Key，将按此账号独立查询配额。':'用于 API 调用记录，不代表会员剩余额度。';};
    const defaults=()=>{const pid=v('f-provider'),p=this._providers.find(x=>x.id===pid);document.getElementById('f-base').value=v('f-kind')==='token_plan'?'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1':p?.base_url||'';document.getElementById('f-models').value=(p?.models||[]).join(', ');mode();};
    kinds();if([...document.getElementById('f-kind').options].some(o=>o.value===d.kind))document.getElementById('f-kind').value=d.kind;mode();if(!id)defaults();
    document.getElementById('f-provider').onchange=()=>{kinds();defaults();};document.getElementById('f-kind').onchange=defaults;
    document.getElementById('f-cancel').onclick=()=>{wrap.hidden=true;};
    document.getElementById('account-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;const manual=v('f-kind')==='manual';const body={trial_only:v('f-scope')==='trial',name:v('f-name'),provider:v('f-provider'),kind:v('f-kind'),status:v('f-status'),base_url:v('f-base')||null,workspace_id:v('f-wsid')||null,expire_at:v('f-expire')||null,models:v('f-models').split(',').map(s=>s.trim()).filter(Boolean),note:v('f-note'),used_percent:manual&&v('f-used')!==''?Number(v('f-used')):null,resets_at:manual&&v('f-reset')?new Date(v('f-reset')).toISOString():null};if(v('f-apikey')||!id)body.api_key=v('f-apikey');try{if(id)await API.put('/api/keys/'+id,body);else await API.post('/api/keys',body);wrap.hidden=true;await this.load();}catch(err){document.getElementById('account-error').textContent=err.message;}finally{btn.disabled=false;}};
    wrap.scrollIntoView({behavior:'smooth',block:'start'});
  }
};
function v(id){return document.getElementById(id).value.trim();}
function statusTag(s){return `<span class="tag">${fmt.esc(s)}</span>`;}
