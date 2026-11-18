"""Recent Gemini news from the public Google Blog RSS feed."""
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

from ..storage import get_storage
from . import cache_settings

FEED_URL = 'https://blog.google/products/gemini/rss/'
_lock = threading.Lock()


def _fetch():
    request = urllib.request.Request(FEED_URL, headers={'User-Agent': 'Mozilla/5.0 (compatible; AI-Usage-Dashboard/1.0)'})
    with urllib.request.urlopen(request, timeout=12) as response:
        raw = response.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError('feed too large')
    root = ET.fromstring(raw)
    items = []
    for item in root.findall('./channel/item'):
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        parsed = urlparse(link)
        if not title or parsed.scheme != 'https' or parsed.hostname not in ('blog.google', 'www.blog.google'):
            continue
        published = item.findtext('pubDate') or ''
        try:
            published = parsedate_to_datetime(published).isoformat()
        except (ValueError, TypeError, OverflowError):
            published = ''
        items.append({'title': title[:300], 'url': link, 'published_at': published})
        if len(items) == 8:
            break
    if not items:
        raise ValueError('empty feed')
    return {'items': items, 'updated_at': int(time.time())}


def get_updates(force=False):
    with _lock:
        store = get_storage()
        snap = store.get_snapshot('stats', 'gemini_official_updates')
        if not force and snap and time.time() - snap['_t'] < cache_settings.ttl_seconds():
            return {**snap['data'], 'status': 'ok', 'cached': True, 'stale': False}
        try:
            data = _fetch()
            store.set_snapshot('stats', 'gemini_official_updates', {'_t': time.time(), 'data': data})
            return {**data, 'status': 'ok', 'cached': False, 'stale': False}
        except (OSError, ValueError, ET.ParseError):
            if snap:
                return {**snap['data'], 'status': 'ok', 'cached': True, 'stale': True}
            return {'status': 'unavailable', 'items': []}
