import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx
from backend.app import app
from backend import storage, config
from backend.storage.file_store import FileStorage
from backend.services import share_service

class SharingTests(unittest.TestCase):
    def test_remote_cannot_access_management_even_with_forwarded_header(self):
        async def check():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app,client=('192.168.1.55',1234)),base_url='http://192.168.1.1:8000') as c:
                for path in ['/api/keys','/api/stats/overview','/api/stats/quota/live','/api/share/info','/docs','/openapi.json','/static/js/api.js']:
                    r=await c.get(path,headers={'X-Forwarded-For':'127.0.0.1'})
                    self.assertEqual(r.status_code,403,path)
                self.assertEqual((await c.post('/api/share/public')).status_code,403)
                self.assertEqual((await c.get('/share')).status_code,200)
                self.assertEqual((await c.get('/')).status_code,307)
        asyncio.run(check())

    def test_snapshot_redacts_extra_fields_and_does_not_query_cloud(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(config,'DATA_DIR',Path(tempfile.gettempdir())):
            store=FileStorage(Path(tmp))
            store.set_snapshot('stats','codex_usage',{'_t':123,'data':{'api_key':'secret','email':'private','buckets':[{'primary':{'usedPercent':25,'windowDurationMins':300}}]}})
            with patch.object(storage,'_storage',store):
                data=share_service.public_snapshot()
                self.assertEqual(data['cards'][2]['windows'][0]['used'],25)
                self.assertNotIn('secret',json.dumps(data))
                self.assertNotIn('private',json.dumps(data))
                self.assertEqual(len(data['cards']),4)

    def test_local_qr_svg(self):
        svg=share_service.qr_svg('http://192.168.1.2:8000/share')
        self.assertIn(b'<svg',svg)
        self.assertIn(b'<path',svg)

if __name__=='__main__':unittest.main()
