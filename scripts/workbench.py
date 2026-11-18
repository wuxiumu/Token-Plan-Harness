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
DEFAULT_PORT = 8000


def load_dotenv():
    """把 .env 的键值补充进环境变量（真实环境变量优先，不覆盖）。"""
    path = ROOT / '.env'
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def resolve_port():
    raw = os.environ.get('TPH_PORT', '') or str(DEFAULT_PORT)
    try:
        port = int(raw)
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise SystemExit(f'.env 中 TPH_PORT={raw} 不是有效端口（1-65535），请修改 .env 后重试。')
    return port


def _port_note():
    raw = os.environ.get('TPH_PORT', '')
    return f'{raw or DEFAULT_PORT}（来源：{"环境变量/.env" if raw else "默认"}）'


def port_busy(port):
    """真有无害的端口占用者:先连回环(只有活监听才接得住,排除 TIME_WAIT 误报,
    也覆盖只监听 127.0.0.1 的进程),再试 bind 0.0.0.0(抓只绑通配的监听者)。"""
    import socket
    with socket.socket() as sock:
        sock.settimeout(.3)
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            return True
    with socket.socket() as sock:
        # 与 uvicorn 一致:允许 TIME_WAIT 复用,避免刚重启的旧连接被误判为占用
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('0.0.0.0', port))
        except OSError:
            return True
    return False


def ensure_port_free(port):
    if port_busy(port):
        holder = port_holder(port)
        raise SystemExit(
            f'端口 {port} 已被占用{"（" + holder + "）" if holder else ""}，工作台未启动，也不会停止其他进程。\n'
            f'多项目冲突处理：编辑 .env，修改或添加 TPH_PORT=<空闲端口>，再运行 ./run.sh restart；'
            f'或临时用 TPH_PORT=<端口> ./run.sh restart。'
        )


def port_holder(port):
    """尽量查出占用端口的进程描述，查不到返回 None。"""
    try:
        out = subprocess.run(['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN'],
                             capture_output=True, text=True, timeout=5)
        lines = [l for l in (out.stdout or '').splitlines()[1:] if l.strip()]
        return '; '.join(sorted({f"{l.split()[0]}(pid {l.split()[1]})" for l in lines})) or None
    except (OSError, subprocess.SubprocessError, IndexError):
        return None


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
    port = resolve_port()
    ensure_port_free(port)
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
    load_dotenv()
    if action == 'log':
        if not LOG.exists():
            raise SystemExit(f'暂无日志文件：{LOG}（服务可能从未启动）')
        if len(sys.argv) > 2 and sys.argv[2] in ('-f', '--follow'):
            os.execv('/usr/bin/tail', ['tail', '-f', '-n', '50', str(LOG)])
        print('\n'.join(LOG.read_text(encoding='utf-8', errors='replace').splitlines()[-50:]))
        raise SystemExit(0)
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
            if info:
                print(f"运行中 · PID {info['pid']} · http://127.0.0.1:{info['port']} · 配置端口 {_port_note()}")
            else:
                print(f'已暂停 · 下次启动端口 {resolve_port()}（.env TPH_PORT，默认 {DEFAULT_PORT}）')
        else:
            raise SystemExit('用法：./run.sh start|stop|pause|restart|status|log [-f]')
