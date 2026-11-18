"""Local background service controller. pause stops the server without deleting data."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / 'data' / 'runtime'
RUNTIME.mkdir(parents=True, exist_ok=True)
STATE = RUNTIME / 'server.json'
LOG = RUNTIME / 'server.log'


def running():
    try:
        info = json.loads(STATE.read_text())
        command = subprocess.check_output(['ps', '-p', str(info['pid']), '-o', 'command='], text=True)
        return info if 'uvicorn' in command and 'backend.app:app' in command and str(ROOT) in command else None
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
        return None


def stop():
    info = running()
    if not info:
        print('工作台已暂停。')
        return
    os.kill(info['pid'], signal.SIGTERM)
    for _ in range(100):
        if not running():
            STATE.unlink(missing_ok=True)
            print('工作台已暂停，数据已保留。')
            return
        time.sleep(.1)
    raise SystemExit('服务仍在结束当前请求，请稍后重试；未强制终止。')


def start():
    info = running()
    if info:
        print(f"已启动：http://127.0.0.1:{info['port']}")
        return
    port = int(os.environ.get('TPH_PORT', '8000'))
    import socket
    with socket.socket() as sock:
        # Match uvicorn: recently closed connections must not look like a live listener.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('0.0.0.0', port))
        except OSError:
            raise SystemExit(f'端口 {port} 已被占用，未停止其他进程。请结束旧服务或设置 TPH_PORT。')
    with LOG.open('ab') as log:
        proc = subprocess.Popen([str(ROOT / '.venv/bin/python'), '-m', 'uvicorn', 'backend.app:app',
                                 '--app-dir', str(ROOT), '--host', '0.0.0.0', '--port', str(port),
                                 '--no-proxy-headers'], cwd=ROOT, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=log, start_new_session=True)
    STATE.write_text(json.dumps({'pid': proc.pid, 'port': port}))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(60):
        if proc.poll() is not None:
            STATE.unlink(missing_ok=True)
            raise SystemExit(f'启动失败，请查看日志：{LOG}')
        try:
            with opener.open(f'http://127.0.0.1:{port}/api/health', timeout=.5) as response:
                if response.status == 200:
                    print(f'已启动：http://127.0.0.1:{port}/#/stats/tokenplan\n局域网分享：点击页面顶部「分享」\n日志：{LOG}')
                    return
        except OSError:
            time.sleep(.25)
    raise SystemExit(f'服务仍在启动，请运行 status 查看状态。日志：{LOG}')


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'start'
    with (RUNTIME / 'control.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action in ('pause', 'stop'):
            stop()
        elif action == 'restart':
            previous = running()
            if previous and 'TPH_PORT' not in os.environ:
                os.environ['TPH_PORT'] = str(previous['port'])
            stop()
            start()
        elif action == 'start':
            start()
        elif action == 'status':
            info = running()
            print(f"运行中 · PID {info['pid']} · http://127.0.0.1:{info['port']}" if info else '已暂停')
        else:
            raise SystemExit('用法：./run.sh start|pause|stop|restart|status')
