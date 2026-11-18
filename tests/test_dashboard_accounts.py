import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend import config, storage
from backend.storage.file_store import FileStorage
from backend.services import key_service as keys, dashboard_service as dashboard, bailian_accounts

class DashboardAccountTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.store=FileStorage(Path(temp.name))
        for p in [patch.object(storage,'_storage',self.store),patch.object(config,'DATA_DIR',Path(temp.name))]:
            p.start();self.addCleanup(p.stop)
    def create(self, **extra):
        return keys.create_key({'provider':'openai','kind':'general','name':'Account','api_key':'synthetic-secret',**extra})
    def test_env_import_multiple_no_overwrite_or_resurrection(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'synthetic-one','OPENAI_API_KEY_2':'synthetic-two'},clear=True):
            keys.bootstrap_default_key();items=keys.list_keys(show_secret=True)
            self.assertEqual(len(items),2)
            keys.update_key(items[0]['id'],{'name':'Edited','api_key':'new-secret','models':['custom']})
            keys.delete_key(items[1]['id']);keys.bootstrap_default_key()
            result=keys.list_keys(show_secret=True)
            self.assertEqual(len(result),1);self.assertEqual(result[0]['api_key'],'new-secret');self.assertEqual(result[0]['models'],['custom'])
    def test_edit_blank_or_mask_does_not_corrupt_secret(self):
        a=self.create()
        for secret in ['',a['api_key']]:
            keys.update_key(a['id'],{'api_key':secret,'name':'Edited'})
            self.assertEqual(keys.get_key(a['id'])['api_key'],'synthetic-secret')
    def test_manual_accounts_allow_multiple_and_zero_clear(self):
        a=self.create(provider='gemini',kind='manual',api_key='',used_percent=0)
        b=self.create(provider='gemini',kind='manual',api_key='',used_percent=40)
        self.assertNotEqual(a['id'],b['id'])
        self.assertEqual(dashboard.summary('account:'+a['id'])['windows'][0]['used'],0)
        keys.update_key(a['id'],{'used_percent':None,'resets_at':None})
        self.assertIsNone(dashboard.summary('account:'+a['id'])['windows'][0]['used'])
    def test_layout_order_empty_and_deleted_account(self):
        a=self.create();ids=['local','account:'+a['id'],'codex-local']
        dashboard.save_layout(ids);self.assertEqual(dashboard.catalog()['selected'],ids)
        keys.delete_key(a['id']);self.assertEqual(dashboard.catalog()['selected'],['local','codex-local'])
        dashboard.save_layout([]);self.assertEqual(dashboard.catalog()['selected'],[])
        for invalid in [['local','local'],['missing']]:
            with self.assertRaises(ValueError):dashboard.save_layout(invalid)
    def test_bailian_key_rotation_invalidates_console_auth(self):
        a=self.create(provider='aliyun',kind='token_plan')
        path=bailian_accounts.config_dir(a['id'])/'config.json'
        import json
        d=json.loads(path.read_text());d['access_token']='personal-token';path.write_text(json.dumps(d))
        keys.update_key(a['id'],{'api_key':'different-key'})
        self.assertNotIn('access_token',json.loads(path.read_text()))
    def test_personal_primary_and_optional_company_module(self):
        personal=self.create(provider='aliyun',kind='token_plan',name='Personal')
        company=self.create(provider='aliyun',kind='token_plan',name='Company',api_key='company-secret')
        self.store.set_snapshot(bailian_accounts.NS,'primary',{'id':personal['id']})
        p,c='account:'+personal['id'],'account:'+company['id']
        catalog=dashboard.catalog()
        self.assertEqual(catalog['selected'][0],p)
        self.assertNotIn(c,catalog['selected'])
        self.assertEqual(next(m for m in catalog['modules'] if m['id']==c)['group'],'other')
        self.assertEqual(bailian_accounts.resolve()['id'],personal['id'])
        dashboard.save_layout([p,c])
        self.assertEqual(dashboard.catalog()['selected'],[p,c])
    def test_zhipu_accounts_use_different_keys_and_caches(self):
        a=self.create(provider='zhipu',kind='code_plan',api_key='key-one')
        b=self.create(provider='zhipu',kind='code_plan',api_key='key-two')
        with patch('backend.services.stats_service.zhipu_code_plan',return_value={'status':'ok','periods':[]}) as fetch:
            dashboard.summary('account:'+a['id']);dashboard.summary('account:'+b['id']);dashboard.summary('account:'+a['id'])
            self.assertEqual([c.kwargs['api_key'] for c in fetch.call_args_list],['key-one','key-two'])
    def test_home_cache_first_reads_expired_data_without_queries(self):
        import time
        from backend.services import codex_usage_service, kimi_usage_service, stats_service
        a=self.create(provider='aliyun',kind='token_plan')
        account=bailian_accounts.resolve(a['id'])
        snapshots={
            'codex_usage':{'status':'ok','buckets':[{'primary':{'windowDurationMins':300,'usedPercent':17,'resetsAt':2000000000}}]},
            'kimi_code_usage':{'status':'ok','windows':[{'id':'limit5h','used_percent':20}]},
            bailian_accounts.cache_key(account):{'token_plan':{'per1MonthPercentage':0.25}},
        }
        for key,data in snapshots.items():self.store.set_snapshot('stats',key,{'data':data,'_t':time.time()-3600})
        with patch.object(codex_usage_service,'_fetch_usage') as codex, patch.object(kimi_usage_service,'_fetch') as kimi, patch.object(stats_service,'live_overview') as live:
            for module,used in [('codex-local',17),('kimi-local',20),('account:'+a['id'],25)]:
                cached=dashboard.summary(module,cache_only=True)
                self.assertTrue(cached['cached']);self.assertTrue(cached['expired'])
                self.assertEqual(cached['windows'][0]['used'],used)
            codex.assert_not_called();kimi.assert_not_called();live.assert_not_called()
    def test_home_cache_miss_then_fetch_and_manual_force(self):
        import time
        from backend.services import codex_usage_service
        data={'status':'ok','buckets':[],'updated_at':int(time.time())}
        with patch.object(codex_usage_service,'_fetch_usage',return_value=data) as fetch:
            self.assertTrue(dashboard.summary('codex-local',cache_only=True)['cache_miss'])
            fetch.assert_not_called()
            dashboard.summary('codex-local')
            dashboard.summary('codex-local')
            self.assertEqual(fetch.call_count,1)
            dashboard.summary('codex-local',force=True)
            self.assertEqual(fetch.call_count,2)

    def test_manual_percent_validation(self):
        for percent in [-1,101,float('nan')]:
            with self.assertRaises(ValueError):self.create(kind='manual',used_percent=percent)
    def test_trial_only_keeps_key_but_excludes_quota_and_modules(self):
        a=self.create(provider='aliyun',kind='token_plan',name='Company')
        module='account:'+a['id']
        dashboard.save_layout([module,'codex-local'])
        keys.update_key(a['id'],{'trial_only':True})
        keys.update_key(a['id'],{'name':'Company edited','api_key':''})
        self.assertTrue(keys.get_key(a['id'])['trial_only'])
        self.assertEqual(keys.get_key_with_secret(a['id']).api_key,'synthetic-secret')
        self.assertIn(a['id'],[k['id'] for k in keys.list_keys(force=True)])
        self.assertEqual(bailian_accounts.list_accounts(),[])
        self.assertNotIn(module,[m['id'] for m in dashboard.catalog()['modules']])
        self.assertEqual(dashboard.catalog()['selected'],['codex-local'])
        with self.assertRaises(ValueError):dashboard.save_layout([module])
        keys.update_key(a['id'],{'trial_only':False})
        self.assertEqual(bailian_accounts.resolve()['id'],a['id'])


class DashboardApiTests(unittest.TestCase):
    def test_manual_account_edit_layout_and_delete_via_api(self):
        import asyncio
        import httpx
        from backend.app import app
        async def exercise():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app,client=('127.0.0.1',1234)),base_url='http://127.0.0.1') as c:
                r=await c.post('/api/keys',json={'name':'My Gemini','provider':'gemini','kind':'manual','used_percent':0})
                self.assertEqual(r.status_code,200);account_id=r.json()['id']
                r=await c.put('/api/keys/'+account_id,json={'name':'Updated','used_percent':35})
                self.assertEqual(r.status_code,200)
                module='account:'+account_id
                r=await c.put('/api/dashboard',json={'selected':[module,'local']})
                self.assertEqual(r.status_code,200)
                self.assertEqual((await c.get('/api/dashboard')).json()['selected'],[module,'local'])
                summary=(await c.get('/api/dashboard/module/'+module)).json()
                self.assertEqual(summary['windows'][0]['used'],35)
                self.assertEqual((await c.delete('/api/keys/'+account_id)).status_code,200)
                self.assertEqual((await c.get('/api/dashboard')).json()['selected'],['local'])
        with tempfile.TemporaryDirectory() as tmp, patch.object(storage,'_storage',FileStorage(Path(tmp))):
            asyncio.run(exercise())
