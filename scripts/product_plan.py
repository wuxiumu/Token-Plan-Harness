"""Validate and inspect the roadmap; never execute task-supplied commands."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / 'docs/product/backlog.json'
STATES = {'todo', 'in_progress', 'blocked', 'done'}
PRIORITY = {'P0': 0, 'P1': 1, 'P2': 2}


def validate(plan, root=ROOT):
    errors = []
    if plan.get('schema_version') != 1:
        errors.append('unsupported schema_version')
    tasks = plan.get('tasks')
    if not isinstance(tasks, list) or not tasks:
        return errors + ['tasks must be a non-empty list']
    index = {}
    for t in tasks:
        if not isinstance(t, dict) or not isinstance(t.get('id'), str):
            errors.append('task requires string id')
            continue
        name = t['id']
        if name in index:
            errors.append(f'{name}: duplicate id')
        index[name] = t
        for key in ('title', 'milestone', 'rollback'):
            if not isinstance(t.get(key), str) or not t[key].strip():
                errors.append(f'{name}: missing {key}')
        if t.get('status') not in STATES or t.get('priority') not in PRIORITY:
            errors.append(f'{name}: invalid status or priority')
        for key in ('depends_on', 'references', 'deliverables', 'steps', 'acceptance', 'verification', 'evidence'):
            if not isinstance(t.get(key), list) or any(not isinstance(x, str) or not x.strip() for x in t[key]):
                errors.append(f'{name}: invalid {key}')
            elif key not in ('depends_on', 'evidence') and not t[key]:
                errors.append(f'{name}: empty {key}')
        for key in ('references', 'evidence'):
            for value in t.get(key, []) if isinstance(t.get(key), list) else []:
                if not isinstance(value, str):
                    continue
                path = (root / value).resolve()
                if not path.is_relative_to(root.resolve()) or not path.is_file():
                    errors.append(f'{name}: missing or unsafe {key}: {value}')
        if t.get('status') == 'done' and not t.get('evidence'):
            errors.append(f'{name}: done requires evidence files')
        if t.get('status') == 'blocked' and not t.get('blocked_reason'):
            errors.append(f'{name}: blocked requires blocked_reason')
    if errors:
        return errors
    visiting, seen = set(), set()
    def visit(name):
        if name in visiting:
            errors.append(f'{name}: dependency cycle')
            return
        if name in seen:
            return
        visiting.add(name)
        for dep in index[name]['depends_on']:
            if dep not in index:
                errors.append(f'{name}: unknown dependency {dep}')
                continue
            if index[name]['status'] in ('done', 'in_progress') and index[dep]['status'] != 'done':
                errors.append(f'{name}: dependency {dep} is unfinished')
            visit(dep)
        visiting.remove(name)
        seen.add(name)
    for name in index:
        visit(name)
    return errors


def next_task(plan):
    index = {t['id']: t for t in plan['tasks']}
    ready = [t for t in plan['tasks'] if t['status'] in ('todo', 'in_progress')
             and all(index[d]['status'] == 'done' for d in t['depends_on'])]
    return min(ready, key=lambda t: (t['status'] != 'in_progress', PRIORITY[t['priority']], plan['tasks'].index(t))) if ready else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['validate', 'next', 'show'])
    parser.add_argument('task_id', nargs='?')
    args = parser.parse_args()
    try:
        plan = json.loads(PLAN.read_text())
        errors = validate(plan)
    except (OSError, ValueError, TypeError) as exc:
        raise SystemExit(f'Invalid plan: {exc}')
    if errors:
        raise SystemExit('\n'.join(errors))
    if args.action == 'validate':
        print(f"Valid plan: {len(plan['tasks'])} tasks. Evidence presence is checked; acceptance still requires review.")
    elif args.action == 'next':
        print(json.dumps(next_task(plan), ensure_ascii=False, indent=2))
    else:
        task = next((t for t in plan['tasks'] if t['id'] == args.task_id), None)
        if not task:
            raise SystemExit('Unknown task id')
        print(json.dumps(task, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
