"""LAN sharing exposes a small, explicit projection of cached quota data."""
import io
import ipaddress
import socket
import subprocess
import time
from ..storage import get_storage
from . import bailian_accounts, cache_settings


def lan_addresses():
    candidates = set()
    try:
        result = subprocess.run(['ifconfig'], capture_output=True, text=True, timeout=2)
        import re
        candidates.update(re.findall(r'\binet (\d+\.\d+\.\d+\.\d+)', result.stdout))
    except OSError:
        pass
    try:
        candidates.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    networks = [ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
    return sorted(ip for ip in candidates if any(ipaddress.ip_address(ip) in n for n in networks))


def links(port):
    return [f'http://{ip}:{port}/share' for ip in lan_addresses()]


def qr_svg(url):
    import qrcode
    from qrcode.image.svg import SvgPathImage
    result = io.BytesIO()
    qrcode.make(url, image_factory=SvgPathImage, border=4).save(result)
    return result.getvalue()


def public_snapshot():
    store = get_storage()
    def snap(ns, key):
        value = store.get_snapshot(ns, key) or {}
        return value.get('data') or {}, value.get('_t', 0)
    def percent(value):
        return value if type(value) in (int, float) and 0 <= value <= 100 else None
    def card(name, windows, updated):
        return {'name': name, 'windows': windows, 'updated_at': updated,
                'stale': not updated or time.time() - updated >= cache_settings.ttl_seconds()}
    account = bailian_accounts.resolve()
    data, updated = snap('stats', bailian_accounts.cache_key(account))
    plan = data.get('token_plan') or {}
    ratio = plan.get('per1MonthPercentage')
    used = percent(ratio * 100) if type(ratio) in (int, float) else None
    cards = [card('百炼 · ' + (account['label'] if account else 'Token Plan'),
                  [{'name': '月度额度', 'used': used}], updated)]
    zhipu, updated = snap('stats', 'mod_zhipu')
    cards.append(card('智谱 Code Plan', [{'name': p.get('unit', '额度'), 'used': percent(p.get('percentage'))}
                                       for p in zhipu.get('periods', [])], updated))
    codex, updated = snap('stats', 'codex_usage')
    windows = []
    for bucket in codex.get('buckets', []):
        for name in ('primary', 'secondary'):
            w = bucket.get(name)
            if w:
                mins = w.get('windowDurationMins')
                label = f'{mins // 60} 小时' if type(mins) is int and mins % 60 == 0 else '额度窗口'
                windows.append({'name': label, 'used': percent(w.get('usedPercent'))})
    cards.append(card('Codex', windows, updated or codex.get('updated_at', 0)))
    kimi, updated = snap('stats', 'kimi_code_usage')
    labels = {'monthTotal': '会员月度总额度', 'monthCode': 'Code 月度额度', 'limit5h': 'Code 5 小时额度', 'limit7d': 'Code 每周额度'}
    cards.append(card('Kimi', [{'name': labels.get(w.get('id'), '额度窗口'), 'used': percent(w.get('used_percent'))}
                               for w in kimi.get('windows', [])], updated or kimi.get('updated_at', 0)))
    return {'cards': cards, 'cache_minutes': cache_settings.get_minutes()}
