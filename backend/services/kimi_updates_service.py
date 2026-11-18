"""Latest public posts from the official Kimi research blog."""
import re
import threading
import time
import urllib.request
from html import unescape
from urllib.parse import urljoin, urlparse

from ..storage import get_storage
from . import cache_settings

BLOG_URL = 'https://www.kimi.com/blog/'
_lock = threading.Lock()


def _fetch():
    request = urllib.request.Request(BLOG_URL, headers={'User-Agent': 'Mozilla/5.0 (compatible; AI-Usage-Dashboard/1.0)'})
    with urllib.request.urlopen(request, timeout=12) as response:
        raw = response.read(1_000_001).decode('utf-8', errors='ignore')
    if len(raw) >= 1_000_001:
        raise ValueError('page too large')
    items, seen = [], set()
    for href, title in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', raw, re.I | re.S):
        link = urljoin(BLOG_URL, unescape(href).strip())
        text = re.sub(r'<[^>]+>', ' ', unescape(title))
        text = re.sub(r'\s+', ' ', text).strip()
        parsed = urlparse(link)
        if not text or len(text) < 4 or parsed.scheme != 'https' or parsed.hostname not in ('kimi.com', 'www.kimi.com') or '/blog/' not in parsed.path or link.rstrip('/') == BLOG_URL.rstrip('/') or link in seen:
            continue
        seen.add(link)
        items.append({'title': text[:240], 'url': link})
        if len(items) == 8:
            break
    if not items:
        raise ValueError('empty blog')
    return {'items': items, 'updated_at': int(time.time())}


def get_updates(force=False):
    with _lock:
        store = get_storage()
        snap = store.get_snapshot('stats', 'kimi_official_updates')
        if not force and snap and time.time() - snap['_t'] < cache_settings.ttl_seconds():
            return {**snap['data'], 'status': 'ok', 'cached': True, 'stale': False}
        try:
            data = _fetch()
            store.set_snapshot('stats', 'kimi_official_updates', {'_t': time.time(), 'data': data})
            return {**data, 'status': 'ok', 'cached': False, 'stale': False}
        except (OSError, ValueError):
            if snap:
                return {**snap['data'], 'status': 'ok', 'cached': True, 'stale': True}
            return {'status': 'unavailable', 'items': []}
