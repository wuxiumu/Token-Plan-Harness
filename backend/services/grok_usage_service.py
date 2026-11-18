"""xAI Management API usage and manually recorded Grok subscription snapshots."""
import hashlib
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from ..storage import get_storage
from . import cache_settings

_lock = threading.Lock()


def _credentials():
    return os.environ.get('XAI_MANAGEMENT_KEY', '').strip(), os.environ.get('XAI_TEAM_ID', '').strip()


def _fetch_usage(key, team):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=30)
    body = {'analyticsRequest': {'timeRange': {
        'startTime': start.strftime('%Y-%m-%d %H:%M:%S'),
        'endTime': end.strftime('%Y-%m-%d %H:%M:%S'), 'timezone': 'Etc/GMT'},
        'timeUnit': 'TIME_UNIT_DAY', 'values': [{'name': 'usd', 'aggregation': 'AGGREGATION_SUM'}],
        'groupBy': ['description'], 'filters': []}}
    url = 'https://management-api.x.ai/v1/billing/teams/' + quote(team, safe='') + '/usage'
    try:
        response = httpx.post(url, headers={'Authorization': 'Bearer ' + key}, json=body, timeout=20, follow_redirects=False)
        if response.status_code != 200:
            return {'status': 'error', 'message': f'xAI 查询失败（HTTP {response.status_code}），请检查团队 ID、管理密钥及权限。'}
        payload = response.json()
        series = payload.get('timeSeries')
        if not isinstance(series, list):
            raise ValueError('invalid response')
        groups = []
        for item in series:
            values = [point['values'][0] for point in item.get('dataPoints', []) if point.get('values')]
            if any(isinstance(v, bool) or not isinstance(v, (float, int)) for v in values):
                raise ValueError('invalid values')
            groups.append({'name': ' / '.join(str(x) for x in (item.get('groupLabels') or item.get('group') or ['未分组'])), 'usd': sum(values)})
        return {'status': 'ok', 'groups': groups, 'total_usd': sum(g['usd'] for g in groups),
                'partial': bool(payload.get('limitReached')), 'start': start.isoformat(),
                'end': end.isoformat(), 'updated_at': int(time.time())}
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
        return {'status': 'error', 'message': '无法读取 xAI 用量，请检查网络及管理密钥权限。'}


def get_usage(force=False):
    key, team = _credentials()
    if not key or not team:
        return {'status': 'not_configured', 'message': '请在 .env 配置 XAI_MANAGEMENT_KEY 和 XAI_TEAM_ID，然后重启工作台。'}
    identity = hashlib.sha256((team + '\0' + key).encode()).hexdigest()
    with _lock:
        store = get_storage()
        snap = store.get_snapshot('stats', 'grok_api_usage')
        if snap and snap.get('identity') != identity:
            snap = None
        if not force and snap and time.time() - snap['_t'] < cache_settings.ttl_seconds():
            return {**snap['data'], 'cached': True, 'stale': False}
        data = _fetch_usage(key, team)
        if data['status'] == 'ok':
            store.set_snapshot('stats', 'grok_api_usage', {'_t': time.time(), 'identity': identity, 'data': data})
            return {**data, 'cached': False, 'stale': False}
        if snap:
            return {**snap['data'], 'cached': True, 'stale': True, 'message': data['message']}
        return data


def get_subscription():
    return get_storage().get_snapshot('stats', 'grok_subscription')


def save_subscription(used_percent, resets_at):
    data = {'used_percent': used_percent, 'resets_at': resets_at, 'updated_at': int(time.time()), 'source': 'manual'}
    get_storage().set_snapshot('stats', 'grok_subscription', data)
    return data
