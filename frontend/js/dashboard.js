const Dashboard = {
  async mount(body){
    clearInterval(this.timer);
    clearInterval(this.clock);
    body.innerHTML='<div class="loading">读取首页配置…</div>';
    let catalog;
    try{catalog=await API.get('/api/dashboard');}catch(e){body.textContent=e.message;return;}
    if(!body.isConnected)return;
    const modules=catalog.modules, state=new Map(), busy=new Set();let selected=[...catalog.selected], dragged=null, saves=Promise.resolve();
    body.innerHTML=`<section class="home-hero"><div class="home-hero-copy"><h2>五棵松的工作台<span class="home-live-dot" aria-hidden="true"></span></h2><p class="home-slogan">让每一份 AI 能量，<em>都用在创造上。</em></p></div><div class="home-hero-side"><details class="home-menu home-main-menu" name="home-actions"><summary aria-label="首页更多操作" title="更多操作">⋯</summary><div class="home-menu-panel"><button type="button" id="home-config">编辑首页</button><a href="#/keys">管理账号</a><button type="button" id="home-refresh">刷新全部卡片</button><button type="button" id="home-display">大屏展示</button></div></details><span id="home-status" role="status"></span></div></section><section class="panel home-config" id="home-config-panel" hidden><div class="row"><h3>选择首页展示的内容</h3><div class="spacer"></div><button class="btn ghost sm" id="home-done">完成</button><button class="btn ghost sm" id="home-save">保存当前布局</button></div><p class="muted">勾选账号，拖动卡片调整顺序；取消勾选只隐藏，不删除账号。</p><div id="home-options"></div></section><section class="home-grid" id="home-grid"></section><section class="model-mode-overview"><div class="model-mode-heading"><div><span>MODEL MAP / 模型地图</span><h3>不知道选哪个模型？</h3><p>先按任务选模式，再决定要不要升级。模型名称和可用版本以客户端当前显示为准。</p></div><a class="btn ghost sm" href="#/stats/gpt">查看 GPT 模型说明 ↗</a></div><div class="model-mode-cards"><a href="#/stats/gpt"><strong>Sol</strong><span>日常主力 · 平衡速度与能力</span></a><a href="#/stats/gpt"><strong>Terra</strong><span>代码与结构化 · 稳定执行</span></a><a href="#/stats/gpt"><strong>Astra</strong><span>复杂推理 · 多步分析</span></a><a href="#/stats/gpt"><strong>Luna</strong><span>快速轻量 · 先试再升级</span></a></div><div class="model-vendor-overview"><a href="#/stats/gpt"><strong>Grok</strong><span>实时探索与观点碰撞</span></a><a href="#/stats/gpt"><strong>Kimi</strong><span>长文档与研究整理</span></a><a href="#/stats/gpt"><strong>Gemini</strong><span>多模态与 Google 生态</span></a><a href="#/stats/gpt"><strong>Claude</strong><span>长文写作与代码分析</span></a></div></section>`;
    const grid=body.querySelector('#home-grid'),status=body.querySelector('#home-status'),panel=body.querySelector('#home-config-panel');
    const active=()=>body.isConnected&&document.getElementById('view-stats')?.classList.contains('active');
    const save=()=>{const snapshot=[...selected];status.textContent='保存中…';saves=saves.catch(()=>{}).then(()=>API.put('/api/dashboard',{selected:snapshot})).then(()=>{if(active())status.textContent='布局已保存';}).catch(()=>{if(active()){status.textContent='保存失败，请点「保存当前布局」重试';panel.hidden=false;}});};
    const paintOptions=()=>{const option=m=>`<label><input type="checkbox" data-select="${fmt.esc(m.id)}" ${selected.includes(m.id)?'checked':''}><span>${fmt.esc(m.name)}</span><small>${fmt.esc(m.provider)}</small></label>`;const others=modules.filter(m=>m.group==='other');body.querySelector('#home-options').innerHTML=`<div class="module-options">${modules.filter(m=>m.group!=='other').map(option).join('')}</div>${others.length?`<details class="home-other"><summary>其他账号 · 备用（${others.length}）</summary><p class="muted">需要时勾选，即可显示在首页。</p><div class="module-options">${others.map(option).join('')}</div></details>`:''}`;body.querySelectorAll('[data-select]').forEach(c=>c.onchange=()=>{if(c.checked)selected.push(c.dataset.select);else selected=selected.filter(i=>i!==c.dataset.select);paint();save();if(c.checked)refresh(c.dataset.select);});};
    const timestamp=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'时间未知':date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});};
    const heading=m=>{
      const names={aliyun:'百炼',zhipu:'智谱',codex:'Codex',kimi:'Kimi',grok:'Grok',gemini:'Gemini',claude:'Claude',openai:'OpenAI',deepseek:'DeepSeek',local:'本机用量'};
      const clean=m.name.replace(/\s*·\s*[A-Z][A-Z0-9_]*API_KEY(?:_[0-9]+)?$/, '').trim();
      const suffix=clean.split('·').slice(1).join('·').trim();
      const title=names[m.provider]||clean;
      const subtitle=suffix||(m.kind==='code_plan'?'Code Plan':m.kind==='token_plan'?'Token Plan':m.kind==='manual'?'手工记录':m.kind==='management'?'API 费用':clean!==title?clean:'用量概览');
      return `<h3 title="${fmt.esc(m.name)}">${fmt.esc(title)}</h3><p class="home-subtitle" title="${fmt.esc(subtitle)}">${fmt.esc(subtitle)}</p>`;
    };
    const countdown=reset=>{
      const ms=new Date(reset).getTime();if(!reset||!Number.isFinite(ms))return '<span class="home-time-unknown">重置时间未提供</span>';
      return `<div class="home-reset" data-reset="${ms}"><span class="home-reset-label">距重置</span><time class="home-countdown" datetime="${new Date(ms).toISOString()}" title="${fmt.esc(new Date(ms).toLocaleString('zh-CN'))}"></time><small>${fmt.esc(timestamp(ms))} 重置</small></div>`;
    };
    const tick=()=>{
      if(!active())return;
      const now=Date.now();grid.querySelectorAll('[data-reset]').forEach(el=>{
        const seconds=Math.max(0,Math.ceil((Number(el.dataset.reset)-now)/1000)),time=el.querySelector('time');
        el.classList.toggle('is-urgent',seconds>0&&seconds<=3600);el.classList.toggle('is-critical',seconds>0&&seconds<=900);el.classList.toggle('is-due',seconds===0);
        el.querySelector('.home-reset-label').textContent=seconds===0?'重置时间已到':'距重置';
        if(seconds===0){time.textContent='等待额度更新';return;}
        const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),sec=seconds%60;
        const pad=n=>String(n).padStart(2,'0');
        time.innerHTML=`${days?`<span>${days}<small>天</small></span>`:''}<span>${pad(hours)}</span><b>:</b><span>${pad(minutes)}</span><b>:</b><span class="countdown-seconds">${pad(sec)}</span>`;
      });
    };
    const detail=d=>{
      if(d.cache_miss)return '<p class="home-cache-pending">读取额度…</p>';
      const windows=(d.windows||[]).map((w,index)=>{
        const valid=typeof w.used==='number'&&Number.isFinite(w.used)&&w.used>=0&&w.used<=100,remain=valid?Number((100-w.used).toFixed(2)):null;
        const color=remain==null?'unknown':remain<=20?'low':remain<=50?'medium':'healthy';
        return `<div class="home-window ${index?'home-window-compact':'home-window-main'}"><div class="home-donut ${color}" role="img" aria-label="${fmt.esc(w.name)}，剩余 ${remain==null?'未知':remain+'%'}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="donut-track" cx="60" cy="60" r="51"/><circle class="donut-value" cx="60" cy="60" r="51" pathLength="100" style="--slice:${remain??0}"/></svg><div class="home-donut-label"><strong>${remain==null?'—':remain+'%'}</strong>${index?'':'<small>剩余额度</small>'}</div></div><div class="home-window-copy"><div class="home-window-title">${fmt.esc(w.name)}</div><span class="home-used">${valid?'已用 '+Number(w.used.toFixed(2))+'%':'用量未知'}</span>${countdown(w.reset)}</div></div>`;
      }).join('');
      const updated=d.updated_at?d.updated_at*1000:d.recorded_at;
      const note=d.stale?'更新失败，显示已有缓存':d.recorded_at?'手工记录':d.windows?.length?'':d.note||'';
      return `<div class="home-visuals">${windows}${typeof d.cost_usd==='number'?`<strong class="home-cost">$${d.cost_usd.toFixed(4)}</strong>`:''}${d.local&&!windows?`<div class="home-local"><strong>${fmt.num(d.local.calls)}<small> 次调用</small></strong><span>${fmt.num(d.local.total_tokens)} Tokens</span></div>`:''}</div><div class="home-card-meta">${note?`<p class="home-note" title="${fmt.esc(d.note||note)}">${fmt.esc(note)}</p>`:''}<div class="home-cache-info"><span class="home-cache-badge">${d.stale?'旧缓存':d.expired?'更新中':d.cached?'缓存':d.recorded_at?'手动':'最新'}</span>${updated?`<time title="${fmt.esc(new Date(updated).toLocaleString('zh-CN'))}">${fmt.esc(timestamp(updated))} 更新</time>`:''}</div></div>`;
    };
    const paint=()=>{grid.innerHTML=selected.map((id,i)=>{const m=modules.find(m=>m.id===id);return `<article class="home-module" data-module="${fmt.esc(id)}"><header><button class="drag-handle" draggable="true" title="拖动调整顺序" aria-label="拖动 ${fmt.esc(m.name)}">⠿</button><span>${fmt.esc(m.provider.toUpperCase())}</span><div class="spacer"></div><details class="home-menu" name="home-actions"><summary aria-label="${fmt.esc(m.name)}更多操作" title="更多操作">⋯</summary><div class="home-menu-panel"><button type="button" data-refresh="${fmt.esc(id)}" aria-label="刷新 ${fmt.esc(m.name)}">刷新额度</button>${id.startsWith('account:')?`<a href="#/keys/${encodeURIComponent(id.slice(8))}">编辑账号</a>`:''}${m.site?`<a href="${m.site}" target="_blank" rel="noopener noreferrer">前往官网 ↗</a>`:''}<button type="button" data-move="${fmt.esc(id)}" data-dir="-1" ${i===0?'disabled':''}>向前移动</button><button type="button" data-move="${fmt.esc(id)}" data-dir="1" ${i===selected.length-1?'disabled':''}>向后移动</button></div></details></header><div class="home-card-heading">${heading(m)}</div><div class="home-module-body">${state.has(id)?detail(state.get(id)):'读取缓存…'}</div></article>`;}).join('')||'<div class="panel"><h3>首页还没有模块</h3><p>点击右上角「⋯ → 编辑首页」添加模块。</p></div>';
      tick();
      grid.querySelectorAll('[data-refresh]').forEach(b=>{b.disabled=busy.has(b.dataset.refresh);b.onclick=()=>refresh(b.dataset.refresh,true);});
      grid.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>move(b.dataset.move,selected.indexOf(b.dataset.move)+Number(b.dataset.dir)));
      grid.querySelectorAll('.drag-handle').forEach(b=>{b.ondragstart=e=>{dragged=b.closest('[data-module]').dataset.module;e.dataTransfer.setData('text/plain',dragged);e.dataTransfer.effectAllowed='move';};b.ondragend=()=>{dragged=null;grid.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));};});
      grid.querySelectorAll('[data-module]').forEach(c=>{c.ondragover=e=>{if(dragged){e.preventDefault();c.classList.add('drag-over');}};c.ondragleave=()=>c.classList.remove('drag-over');c.ondrop=e=>{e.preventDefault();if(dragged)move(dragged,selected.indexOf(c.dataset.module));dragged=null;};});
    };
    const move=(id,index)=>{if(index<0||index>=selected.length)return;selected.splice(selected.indexOf(id),1);selected.splice(index,0,id);paint();save();};
    const updateCard=id=>{if(!active())return;const card=Array.from(grid.querySelectorAll('[data-module]')).find(c=>c.dataset.module===id);if(card){card.querySelector('.home-module-body').innerHTML=detail(state.get(id));card.querySelector('[data-refresh]').disabled=busy.has(id);tick();}};
    const refresh=async(id,force=false)=>{
      if(!active()||busy.has(id))return;
      busy.add(id);const btn=Array.from(grid.querySelectorAll('[data-refresh]')).find(b=>b.dataset.refresh===id);if(btn)btn.disabled=true;
      const url='/api/dashboard/module/'+encodeURIComponent(id);
      try{
        const d=await API.get(url+(force?'?force=true':'?cache_only=true'));
        state.set(id,d);updateCard(id);
        if(!force&&(d.cache_miss||d.expired)&&active()){
          const fresh=await API.get(url);state.set(id,fresh);
        }
      }catch(e){state.set(id,{...(state.get(id)||{}),cache_miss:false,expired:false,note:'读取失败：'+e.message,stale:true});}
      finally{busy.delete(id);updateCard(id);}
    };
    body.querySelector('#home-config').onclick=()=>{panel.hidden=!panel.hidden;};body.querySelector('#home-done').onclick=()=>panel.hidden=true;body.querySelector('#home-save').onclick=save;
    body.querySelector('#home-refresh').onclick=()=>selected.forEach(id=>refresh(id,true));
    body.querySelector('#home-display').onclick=()=>{const presenting=body.classList.toggle('home-presenting');body.querySelector('#home-display').textContent=presenting?'退出大屏展示':'大屏展示';};
    body.onclick=e=>{const action=e.target.closest('.home-menu-panel button,.home-menu-panel a');if(!e.target.closest('.home-menu')||action)body.querySelectorAll('.home-menu[open]').forEach(menu=>{if(action)menu.querySelector('summary').focus();menu.open=false;});};
    body.onkeydown=e=>{if(e.key==='Escape'){const menu=body.querySelector('.home-menu[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();}else if(body.classList.contains('home-presenting')){body.classList.remove('home-presenting');body.querySelector('#home-display').textContent='大屏展示';}}};
    paintOptions();paint();selected.forEach(id=>refresh(id));
    tick();this.clock=setInterval(()=>{if(!active()){clearInterval(this.clock);return;}if(!document.hidden)tick();},1000);
    this.timer=setInterval(()=>{if(!active()){clearInterval(this.timer);return;}if(!document.hidden)selected.forEach(id=>refresh(id));},60000);
  }
};
