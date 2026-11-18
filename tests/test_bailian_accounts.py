import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import config, storage
from backend.adapters.bailian_cli import BailianCli
from backend.services import bailian_accounts as accounts, key_service, stats_service
from backend.storage.file_store import FileStorage


class AccountIsolationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.store = FileStorage(self.directory)
        for p in (patch.object(config, 'DATA_DIR', self.directory), patch.object(storage, '_storage', self.store)):
            p.start()
            self.addCleanup(p.stop)
        for name in ('personal', 'company'):
            key_service.create_key({'id': name, 'name': name, 'kind': 'token_plan', 'api_key': 'secret-' + name})
            accounts.register(name, name, {'api_key': 'secret-' + name}, primary=name == 'company')

    def test_primary_and_secondary_are_separate(self):
        self.assertEqual(accounts.resolve()['id'], 'company')
        self.assertEqual(accounts.resolve('personal')['id'], 'personal')
        self.assertNotEqual(accounts.cache_key(accounts.resolve()), accounts.cache_key(accounts.resolve('personal')))
        self.assertNotIn('secret', json.dumps(accounts.list_accounts()))

    def test_api_key_only_shows_scoped_local_usage_without_login_prompt(self):
        self.store.set_obj(accounts.NS, 'company', {'id': 'company', 'label': 'company', 'quota_access': 'api_key_only'})
        self.store.set_obj('usage_record', 'one', {'key_id': 'company', 'total_tokens': 12})
        self.store.set_obj('usage_record', 'two', {'key_id': 'personal', 'total_tokens': 99})
        result = stats_service.live_overview()
        self.assertEqual(result['quota_status'], 'api_key_only')
        self.assertIsNone(result['login_command'])
        self.assertEqual(result['local_usage']['calls'], 1)
        self.assertEqual(result['local_usage']['total_tokens'], 12)

    def test_no_console_does_not_borrow_global_login_or_cached_personal_quota(self):
        self.store.set_snapshot('stats', 'mod_live', {'_t': time.time(), 'data': {'token_plan': {'per1MonthPercentage': .8}}})
        with patch.object(stats_service, 'BailianCli') as cli:
            result = stats_service.quota_source('live')
        cli.assert_not_called()
        self.assertNotIn('per1MonthPercentage', result['data']['token_plan'])
        self.assertIn('company', result['data']['login_command'])
        self.assertNotIn('secret-company', json.dumps(result))

    def test_cache_is_partitioned_and_force_only_refreshes_selected_account(self):
        def fetch(account_id):
            return {'token_plan': {'per1MonthPercentage': .2 if account_id == 'company' else .7}}
        with patch.object(stats_service, 'live_overview', side_effect=fetch) as query:
            self.assertEqual(stats_service.quota_source('live')['data']['token_plan']['per1MonthPercentage'], .2)
            self.assertEqual(stats_service.quota_source('live', account_id='personal')['data']['token_plan']['per1MonthPercentage'], .7)
            self.assertTrue(stats_service.quota_source('live')['cached'])
            stats_service.quota_source('live', force=True, account_id='personal')
            self.assertEqual([c.args[0] for c in query.call_args_list], ['company', 'personal', 'personal'])

    def test_stale_fallback_is_only_for_same_account(self):
        personal = accounts.resolve('personal')
        self.store.set_snapshot('stats', accounts.cache_key(personal), {'_t': 1, 'data': {'token_plan': {'per1MonthPercentage': .7}}})
        with patch.object(stats_service, 'live_overview', return_value={'token_plan': {'error': 'offline'}}):
            self.assertTrue(stats_service.quota_source('live', account_id='personal')['stale'])
            self.assertFalse(stats_service.quota_source('live')['stale'])

    def test_login_change_invalidates_cached_identity(self):
        company = accounts.resolve()
        before = accounts.cache_key(company)
        path = accounts.config_dir('company') / 'config.json'
        data = json.loads(path.read_text())
        data['access_token'] = 'new-session'
        path.write_text(json.dumps(data))
        self.assertNotEqual(before, accounts.cache_key(company))

    def test_cli_has_explicit_config_and_no_inherited_credentials(self):
        with patch.dict(os.environ, {'DASHSCOPE_API_KEY': 'wrong-key', 'BAILIAN_WORKSPACE_ID': 'wrong-workspace'}):
            with patch('backend.adapters.bailian_cli.subprocess.run') as run:
                run.return_value.stdout = '{}'
                BailianCli(config_dir=self.directory).usage_token_plan()
                args, kwargs = run.call_args
                self.assertEqual(args[0][-2:], ['--config', 'default'])
                self.assertEqual(kwargs['env']['BAILIAN_CONFIG_DIR'], str(self.directory))
                self.assertNotIn('DASHSCOPE_API_KEY', kwargs['env'])
                self.assertNotIn('BAILIAN_WORKSPACE_ID', kwargs['env'])

    def test_invalid_account_does_not_fall_back(self):
        with self.assertRaises(ValueError):
            stats_service.quota_source('live', account_id='missing')
        with self.assertRaises(ValueError):
            accounts.config_dir('../outside')


if __name__ == '__main__':
    unittest.main()
