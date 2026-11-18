"""Read Kimi Code account quota via its authenticated local server."""
import atexit
import os
import socket
import subprocess
import threading
import time
from pathlib import Path

import httpx

from .. import config
from ..storage import get_storage
from . import cache_settings

_lock = threading.Lock()
_process = None
_port = None


def _stop():
    global _process
    if _process and _process.poll() is None:
        _process.terminate()
        try:
            _process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            _process.kill()
            _process.wait()


atexit.register(_stop)


def _ensure_server():
    global _process, _port
    if _process is not None and _process.poll() is None:
        return _port
    executable = config.BASE_DIR / 'data/kimi-cli/node_modules/.bin/kimi'
    if not executable.exists():
        raise RuntimeError('未安装 Kimi Code CLI')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    _process = subprocess.Popen([str(executable), 'web', '--no-open', '--port', str(port)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                stdin=subprocess.DEVNULL, cwd=str(config.BASE_DIR))
    _port = port
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if _process.poll() is not None:
            raise RuntimeError('Kimi 本地服务启动失败')
        try:
            r = httpx.get(f'http://127.0.0.1:{port}/api/v1/healthz', timeout=0.5, trust_env=False)
            if r.status_code == 200 and r.json().get('data', {}).get('ok') is True:
                return port
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(0.2)
    _stop()
    raise RuntimeError('Kimi 本地服务启动超时')


def _fetch():
    try:
        port = _ensure_server()
        token_file = Path(os.environ.get('KIMI_CODE_HOME', '~/.kimi-code')).expanduser() / 'server.token'
        token = token_file.read_text(encoding='utf-8').strip()
        r = httpx.get(f'http://127.0.0.1:{port}/api/v1/oauth/usage',
                      headers={'Authorization': f'Bearer {token}'}, timeout=15, trust_env=False)
        r.raise_for_status()
        result = r.json()
        data = result.get('data') or {}
        if result.get('code') != 0 or data.get('kind') != 'ok':
            raise RuntimeError('无法读取 Kimi 会员额度，请检查 Kimi Code 登录状态')
        quota = data.get('quota') or {}
        usages = quota.get('usages')
        if not isinstance(usages, dict):
            raise ValueError('invalid response')
        windows = []
        for key in ('monthTotal', 'monthCode', 'limit5h', 'limit7d'):
            window = usages.get(key)
            if not isinstance(window, dict):
                continue
            ratio = window.get('usedRatio')
            if isinstance(ratio, bool) or not isinstance(ratio, (int, float)) or not 0 <= ratio <= 1:
                continue
            windows.append({'id': key, 'used_percent': round(ratio * 100, 2), 'resets_at': window.get('resetAt')})
        return {'status': 'ok', 'windows': windows, 'updated_at': int(time.time())}
    except (httpx.HTTPError, OSError, ValueError, RuntimeError):
        return {'status': 'unavailable', 'message': '无法读取 Kimi 会员额度，请检查 Kimi Code 登录状态和网络。'}


def get_usage(force=False, cache_only=False):
    if cache_only:
        return cache_settings.cached_result(get_storage().get_snapshot('stats', 'kimi_code_usage'))
    with _lock:
        store = get_storage()
        snap = store.get_snapshot('stats', 'kimi_code_usage')
        if not force and snap and time.time() - snap['_t'] < cache_settings.ttl_seconds():
            return {**snap['data'], 'cached': True, 'stale': False}
        data = _fetch()
        if data['status'] == 'ok':
            store.set_snapshot('stats', 'kimi_code_usage', {'_t': time.time(), 'data': data})
            return {**data, 'cached': False, 'stale': False}
        if snap:
            return {**snap['data'], 'cached': True, 'stale': True, 'message': data['message']}
        return data
