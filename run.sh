#!/usr/bin/env bash
# AI-Key 管理工作台启动脚本
set -e
cd "$(dirname "$0")"

# 创建虚拟环境（如不存在）
if [ ! -d .venv ]; then
  echo "[run] 创建虚拟环境 .venv ..."
  PY=$(command -v python3 || echo /usr/bin/python3)
  # 优先使用较新的 Python
  for cand in /Users/mac/.local/bin/python3 /usr/bin/python3; do
    if [ -x "$cand" ]; then PY="$cand"; break; fi
  done
  "$PY" -m venv .venv
  ./.venv/bin/pip install --upgrade pip -q
  ./.venv/bin/pip install -r requirements.txt -q
fi

exec ./.venv/bin/python scripts/workbench.py "${@:-start}"
