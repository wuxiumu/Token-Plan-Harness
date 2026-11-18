import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import config, storage
from backend.services import domain_monitor_service as domains
from backend.storage.file_store import FileStorage


class DomainMonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = FileStorage(Path(self.tmp.name))
        self.storage_patch = patch.object(storage, '_storage', self.store)
        self.config_patch = patch.object(config, 'DATA_DIR', Path(self.tmp.name))
        self.storage_patch.start(); self.config_patch.start()
        self.addCleanup(self.storage_patch.stop); self.addCleanup(self.config_patch.stop)

    def test_default_and_markdown_config(self):
        self.assertEqual(domains.get_config()['domains'], ['baidu.com', 'qq.com'])
        saved = domains.save_config('# sites\n\n- Example.COM\n- example.com\n- `qq.com` # home')
        self.assertEqual(saved['domains'], ['example.com', 'qq.com'])
        with self.assertRaises(ValueError): domains.save_config('# empty\n\n- localhost')

    def test_health_is_cached_and_reports_status(self):
        class Response:
            status_code = 200
        class Client:
            def __init__(self, **kwargs): pass
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def head(self, url): return Response()
        domains.save_config('- example.com')
        with patch('backend.services.domain_monitor_service.httpx.Client', Client):
            first = domains.health(force=True)
            second = domains.health()
        self.assertEqual(first['items'][0]['status'], 'up')
        self.assertTrue(second['cached'])
