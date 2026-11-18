"""Per-account dashboard modules with persisted selection and order."""
import hashlib
import time
from .. import config
from ..storage import get_storage
from . import key_service, stats_service, bailian_accounts, cache_settings, codex_usage_service, kimi_usage_service, grok_usage_service

SITES = {'aliyun':'https://bailian.console.aliyun.com/', 'zhipu':'https://open.bigmodel.cn/',
         'openai':'https://platform.openai.com/', 'codex':'https://chatgpt.com/codex',
         'kimi':'https://www.kimi.com/', 'deepseek':'https://platform.deepseek.com/',
         'grok':'https://grok.com/', 'gemini':'https://gemini.google.com/', 'claude':'https://claude.ai/'}


def catalog():
    primary = bailian_accounts.resolve()
    other_accounts = {a['id'] for a in bailian_accounts.list_accounts() if not a['primary']}
    modules = [{'id': 'account:' + k['id'], 'name': k['name'], 'provider': k['provider'],
                'site': SITES.get(k['provider'], ''), 'kind': k['kind'],
                'group': 'other' if k['id'] in other_accounts else 'main',
                'default': k['id'] == (primary or {}).get('id') or k['kind'] == 'code_plan'}
               for k in key_service.list_keys(force=True) if not k.get('trial_only')]
    modules.sort(key=lambda m: m['id'] != 'account:' + (primary or {}).get('id', ''))
    modules += [{'id':'codex-local','name':'Codex · 本机登录','provider':'codex','site':SITES['codex'],'default':True},
                {'id':'kimi-local','name':'Kimi · 本机登录','provider':'kimi','site':SITES['kimi'],'default':True},
                {'id':'local','name':'本工作台调用统计','provider':'local','site':'','default':False}]
    layout = get_storage().get_snapshot('settings', 'dashboard')
    ids = {m['id'] for m in modules}
    selected = [i for i in layout['selected'] if i in ids] if layout is not None else [m['id'] for m in modules if m['default']]
    return {'modules': modules, 'selected': selected}


def save_layout(selected):
    ids = {m['id'] for m in catalog()['modules']}
    if not isinstance(selected, list) or any(not isinstance(i, str) or i not in ids for i in selected) or len(set(selected)) != len(selected):
        raise ValueError('模块已变化，请刷新后重新选择')
    get_storage().set_snapshot('settings', 'dashboard', {'selected': selected})
    return {'selected': selected}


def summary(module_id, force=False, cache_only=False):
    if module_id not in {m['id'] for m in catalog()['modules']}:
        raise ValueError('账号或模块已删除')
    if module_id == 'local':
        return {'windows':[], 'local': stats_service.local_stats(), 'note':'仅统计通过本工作台发起的调用'}
    if module_id in ('codex-local','kimi-local'):
        d = codex_usage_service.get_usage(force, cache_only=cache_only) if module_id == 'codex-local' else kimi_usage_service.get_usage(force, cache_only=cache_only)
        windows = []
        if module_id == 'codex-local':
            for b in d.get('buckets', []):
                for w in [b.get('primary'), b.get('secondary')]:
                    if w:
                        minutes = w.get('windowDurationMins')
                        label = '每周' if minutes == 10080 else f'{minutes // 60} 小时' if isinstance(minutes,int) and minutes % 60 == 0 else '额度窗口'
                        windows.append({'name':label, 'used': w.get('usedPercent'), 'reset': w.get('resetsAt',0)*1000 if w.get('resetsAt') else None})
        else:
            labels = {'monthTotal':'会员月度','monthCode':'Code 月度','limit5h':'Code 5 小时','limit7d':'Code 每周'}
            windows = [{'name':labels.get(w['id'],w['id']), 'used':w['used_percent'],'reset':w.get('resets_at')} for w in d.get('windows',[])]
        return {'windows':windows,'note':d.get('message') or '本机 CLI 当前登录账号；其他会员账号可在账号管理中手工记录',
                'updated_at':d.get('updated_at'), 'stale':d.get('stale',False),'cached':d.get('cached',False), 'cache_miss':d.get('cache_miss',False), 'expired':d.get('expired',False)}
    key = key_service.get_key(module_id.split(':',1)[1])
    local = stats_service._sum_usage([r for r in get_storage().list_objs(stats_service.REC_NS) if r.get('key_id') == key['id']])
    result = {'windows':[], 'local':local, 'note':'仅统计通过本工作台发起的调用，不代表平台总用量'}
    if key.get('status') != 'active':
        return {**result,'note':'此账号已停用或过期，可在账号管理中修改'}
    if key.get('kind') == 'manual':
        return {'windows':[{'name':'会员额度 · 手工记录','used':key.get('used_percent'),'reset':key.get('resets_at')}],
                'note':'手工记录，不自动查询；点击编辑更新用量', 'recorded_at':key.get('updated_at')}
    if key['provider'] == 'aliyun' and key['kind'] == 'token_plan':
        d = stats_service.quota_source('live',force, key['id'], cache_only=cache_only)
        p = d['data'].get('token_plan') or {}
        if isinstance(p.get('per1MonthPercentage'),(int,float)):
            result['windows'] = [{'name':'月度配额','used':p['per1MonthPercentage']*100,'reset':p.get('per1MonthResetTime')}]
            result['note'] = '百炼控制台配额'
        else:
            result['note'] = 'API Key 已配置；官方配额需该账号的独立控制台授权'
        return {**result, 'updated_at':d.get('updated_at'),'stale':d['stale'],'cached':d['cached'], 'cache_miss':d.get('cache_miss',False), 'expired':d.get('expired',False)}
    if key['provider'] == 'grok' and key['kind'] == 'management':
        cache_id = 'grok_account_' + key['id'] + '_' + hashlib.sha256((key['api_key'] + str(key.get('workspace_id'))).encode()).hexdigest()[:16]
        store = get_storage(); snap = store.get_snapshot('stats', cache_id)
        if cache_only:
            d = cache_settings.cached_result(snap)
            return {**result, 'windows':[{'name':p['unit'],'used':p['percentage'],'reset':p.get('next_reset_ms')} for p in d.get('periods',[])],
                    'cost_usd':d.get('total_usd'), 'updated_at':d.get('updated_at'),
                    'cached':d['cached'], 'expired':d['expired'], 'cache_miss':d.get('cache_miss',False),
                    'note':'智谱 Code Plan 配额' if key['provider']=='zhipu' else 'xAI 开发者 API 最近 30 天费用'}
        cached = bool(not force and snap and time.time()-snap['_t'] < cache_settings.ttl_seconds())
        d = snap['data'] if cached else grok_usage_service._fetch_usage(key['api_key'], key.get('workspace_id') or '')
        stale = False
        if d.get('status') == 'ok' and not cached:
            snap = {'data':d, '_t':time.time()}; store.set_snapshot('stats', cache_id, snap)
        elif d.get('status') != 'ok' and snap:
            d = snap['data']; stale = True
        return {**result, 'cost_usd':d.get('total_usd'), 'updated_at':snap['_t'] if snap else None,
                'cached':cached, 'stale':stale, 'note': 'xAI 开发者 API 最近 30 天费用' + ('（部分结果）' if d.get('partial') else '') if d.get('status') == 'ok' else '请检查 xAI 管理密钥、团队 ID 和网络'}
    if key['provider'] == 'zhipu' and key['kind'] == 'code_plan':
        cache_id = 'zhipu_account_' + key['id'] + '_' + hashlib.sha256(key['api_key'].encode()).hexdigest()[:16]
        store = get_storage()
        snap = store.get_snapshot('stats',cache_id)
        if cache_only:
            d = cache_settings.cached_result(snap)
            return {**result, 'windows':[{'name':p['unit'],'used':p['percentage'],'reset':p.get('next_reset_ms')} for p in d.get('periods',[])],
                    'cost_usd':d.get('total_usd'), 'updated_at':d.get('updated_at'),
                    'cached':d['cached'], 'expired':d['expired'], 'cache_miss':d.get('cache_miss',False),
                    'note':'智谱 Code Plan 配额' if key['provider']=='zhipu' else 'xAI 开发者 API 最近 30 天费用'}
        cached = bool(not force and snap and time.time()-snap['_t'] < cache_settings.ttl_seconds())
        d = snap['data'] if cached else stats_service.zhipu_code_plan(api_key=key['api_key'])
        stale = False
        if d.get('status') == 'ok' and not cached:
            snap = {'data':d,'_t':time.time()}; store.set_snapshot('stats',cache_id,snap)
        elif d.get('status') != 'ok' and snap:
            d = snap['data']; stale = True
        result.update(windows=[{'name':p['unit'],'used':p['percentage'],'reset':p.get('next_reset_ms')} for p in d.get('periods',[])],
                      note='智谱 Code Plan 配额' if d.get('status') == 'ok' else '查询失败，请检查此账号的 Code Plan Key 和网络',
                      updated_at=snap['_t'] if snap else None, cached=cached,stale=stale)
    return result
