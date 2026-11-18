"""Redis-backed domain monitor configuration and health checks."""
import ipaddress
import re
import socket
import time
from urllib.parse import urlparse

import httpx

from ..storage import get_storage

NS = 'domain_monitor'
CONFIG_KEY = 'config'
HEALTH_KEY = 'health'
DEFAULT_MARKDOWN = '# 监控域名\n\n- baidu.com\n- qq.com\n'
_DOMAIN = re.compile(r'^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$')


def parse_markdown(markdown: str) -> list[str]:
    values = []
    for line in str(markdown or '').splitlines():
        match = re.match(r'^\s*(?:[-*+]\s+|\d+[.)]\s+)?(`?)([a-zA-Z0-9][a-zA-Z0-9.-]*)(?:\1)\s*(?:#.*)?$', line)
        if not match:
            continue
        domain = match.group(2).lower().rstrip('.')
        if not _DOMAIN.fullmatch(domain):
            continue
        try:
            ipaddress.ip_address(domain)
            continue
        except ValueError:
            pass
        if domain not in values:
            values.append(domain)
    return values


def get_config() -> dict:
    store = get_storage()
    snap = store.get_snapshot(NS, CONFIG_KEY)
    if not snap:
        snap = {'markdown': DEFAULT_MARKDOWN, 'domains': ['baidu.com', 'qq.com'], 'updated_at': time.time()}
        store.set_snapshot(NS, CONFIG_KEY, snap)
    return snap


def save_config(markdown: str) -> dict:
    domains = parse_markdown(markdown)
    if not domains:
        raise ValueError('请至少填写一个有效域名，例如 - baidu.com')
    if len(domains) > 50:
        raise ValueError('最多配置 50 个域名')
    data = {'markdown': str(markdown), 'domains': domains, 'updated_at': time.time()}
    store = get_storage(); store.set_snapshot(NS, CONFIG_KEY, data)
    store.set_snapshot(NS, HEALTH_KEY, {'checked_at': 0, 'items': []})
    return data


def _safe_url(domain: str) -> str:
    return f'https://{domain}/'


def _check(domain: str) -> dict:
    started = time.perf_counter()
    url = _safe_url(domain)
    try:
        with httpx.Client(timeout=httpx.Timeout(8.0, connect=4.0), follow_redirects=True, trust_env=False) as client:
            response = client.head(url)
            if response.status_code in (405, 501):
                response = client.get(url, headers={'Range': 'bytes=0-0'})
        elapsed = round((time.perf_counter() - started) * 1000)
        ok = 200 <= response.status_code < 400
        return {'domain': domain, 'status': 'up' if ok else 'down', 'status_code': response.status_code, 'latency_ms': elapsed, 'checked_at': time.time(), 'error': '' if ok else f'HTTP {response.status_code}'}
    except (httpx.HTTPError, OSError, ValueError) as exc:
        return {'domain': domain, 'status': 'down', 'status_code': None, 'latency_ms': round((time.perf_counter() - started) * 1000), 'checked_at': time.time(), 'error': type(exc).__name__}


def health(force=False) -> dict:
    config = get_config(); store = get_storage(); snap = store.get_snapshot(NS, HEALTH_KEY)
    if not force and snap and snap.get('items') and time.time() - snap.get('checked_at', 0) < 60:
        return {'items': snap['items'], 'checked_at': snap['checked_at'], 'cached': True, 'config_updated_at': config['updated_at']}
    items = [_check(domain) for domain in config['domains']]
    checked = time.time(); store.set_snapshot(NS, HEALTH_KEY, {'items': items, 'checked_at': checked})
    return {'items': items, 'checked_at': checked, 'cached': False, 'config_updated_at': config['updated_at']}
