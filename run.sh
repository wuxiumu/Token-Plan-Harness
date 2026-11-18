#!/usr/bin/env bash
# AI-Key 管理工作台启动脚本
# 用法：./run.sh start|stop|pause|restart|status|log [-f]
# 端口：默认 8000；在 .env 配置 TPH_PORT=xxxx 修改（临时覆盖：TPH_PORT=xxxx ./run.sh restart）
#       多项目端口冲突时脚本会提示占用进程，改 .env 后 restart 即可
set -e
cd "$(dirname "$0")"

ACTION="${1:-start}"

PY=./.venv/bin/python
case "$ACTION" in
  start|restart)
    # 启动服务必须有 venv
    if [ ! -d .venv ]; then
      echo "[run] 创建虚拟环境 .venv ..."
      BASE=$(command -v python3 || echo /usr/bin/python3)
      [ -x "$HOME/.local/bin/python3" ] && BASE="$HOME/.local/bin/python3"
      "$BASE" -m venv .venv
      ./.venv/bin/pip install --upgrade pip -q
      ./.venv/bin/pip install -r requirements.txt -q
    fi
    ;;
  *)
    # stop/status/log 不依赖项目包，venv 不存在时用系统 python（workbench.py 仅标准库）
    [ -x "$PY" ] || PY=$(command -v python3 || echo /usr/bin/python3)
    ;;
esac

exec "$PY" scripts/workbench.py "$@"
