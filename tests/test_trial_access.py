import unittest
from unittest.mock import patch
from backend.models import KeyItem
from backend.services.trial_service import chat

class TrialAccessTests(unittest.TestCase):
    def test_disabled_expired_and_invalid_dates_never_call_upstream(self):
        for fields in [{'status':'disabled'},{'status':'expired'},{'expire_at':'2000-01-01T00:00:00Z'},{'expire_at':'invalid'}]:
            with self.subTest(fields=fields):
                key=KeyItem(id='test',name='test',api_key='synthetic',**fields)
                with patch('backend.services.key_service.get_key_with_secret',return_value=key), patch('backend.services.trial_service.httpx.Client') as client:
                    with self.assertRaises(ValueError): chat('test','test',[])
                    client.assert_not_called()
