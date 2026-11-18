"""Dashboard-owned Bailian accounts, with separate CLI credentials and caches."""
import hashlib
import json
import re
import shlex

from .. import config
from ..storage import get_storage
from . import key_service

NS = "bailian_account"


def config_dir(account_id):
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", account_id):
        raise ValueError("无效账号 ID")
    return config.DATA_DIR / "bailian-accounts" / account_id


def register(key_id, label, credentials, primary=False):
    """Explicitly bind credentials; never borrow another account's console login."""
    key = key_service.get_key(key_id)
    if not key or key.get("provider") != "aliyun":
        raise ValueError("百炼 Key 不存在")
    directory = config_dir(key_id)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    path = directory / "config.json"
    if not path.exists():
        path.touch(mode=0o600)
        path.write_text(json.dumps({**credentials, "active_config": "default"}, ensure_ascii=False), encoding="utf-8")
        path.chmod(0o600)
    account = {"id": key_id, "label": label}
    get_storage().set_obj(NS, key_id, account)
    if primary:
        get_storage().set_snapshot(NS, "primary", {"id": key_id})
    return account


def list_accounts():
    accounts = [a for a in get_storage().list_objs(NS)
                if (key_service.get_key(a["id"]) or {}).get("status") == "active"
                and not (key_service.get_key(a["id"]) or {}).get("trial_only")]
    primary = (get_storage().get_snapshot(NS, "primary") or {}).get("id")
    accounts.sort(key=lambda a: (a["id"] != primary, a["id"]))
    return [{**a, "primary": i == 0} for i, a in enumerate(accounts)]


def resolve(account_id=None):
    accounts = list_accounts()
    if account_id is None:
        return accounts[0] if accounts else None
    for account in accounts:
        if account["id"] == account_id:
            return account
    raise ValueError("百炼账号不存在或已停用")


def credentials(account):
    try:
        data = json.loads((config_dir(account["id"]) / "config.json").read_text())
        return {k: v for k, v in data.items() if not isinstance(v, dict)}
    except (OSError, ValueError):
        return {}


def cache_key(account):
    if not account:
        return "mod_live"
    # A fresh login or key change must not reuse the previous identity's snapshot.
    identity = {k: v for k, v in credentials(account).items()
                if k in ("api_key", "access_token", "workspace_id", "console_site", "console_switch_agent")}
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:16]
    return f"live_{account['id']}_{fingerprint}"


def login_command(account):
    directory = shlex.quote(str(config_dir(account["id"])))
    return f"BAILIAN_CONFIG_DIR={directory} bl auth login --console --config default"
