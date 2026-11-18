"""Shared cache lifetime for dashboard data."""
from ..storage import get_storage

DEFAULT_MINUTES = 30


def get_minutes():
    value = get_storage().get_snapshot('settings', 'cache') or {}
    minutes = value.get('minutes', DEFAULT_MINUTES)
    return minutes if type(minutes) is int and 0 <= minutes <= 1440 else DEFAULT_MINUTES


def set_minutes(minutes):
    if type(minutes) is not int or not 0 <= minutes <= 1440:
        raise ValueError('缓存时间须为 0 到 1440 的整数分钟')
    get_storage().set_snapshot('settings', 'cache', {'minutes': minutes})


def ttl_seconds():
    return get_minutes() * 60


def cached_result(snap):
    """Read an existing source snapshot without starting CLI/network work."""
    import time
    if not snap:
        return {'cached': False, 'cache_miss': True, 'expired': False, 'stale': False}
    return {**snap['data'], 'updated_at': snap['_t'], 'cached': True,
            'expired': time.time() - snap['_t'] >= ttl_seconds(), 'stale': False}
