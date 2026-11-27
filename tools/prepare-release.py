"""Bump release versions consistently and verify release notes before tagging."""
import argparse
import json
import re
import sys
from pathlib import Path

VERSION_FILES = (
    'plugin.json',
    'package.json',
    'ide/package.json',
    'sidecars/panel/package.json',
)
SEMVER_RE = re.compile(r'^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description='Prepare a release version bump and preflight check.')
    parser.add_argument('version', nargs='?', help='Target version without leading v (e.g. 1.0.2)')
    parser.add_argument('--check', action='store_true', help='Verify all manifests and release notes match without writing')
    return parser.parse_args(argv)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def update_version_file(path, version, write=True):
    data = read_json(path)
    current = data.get('version')
    if current == version:
        return current, False
    if write:
        data['version'] = version
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return current, True


def check_notes(root, version):
    issues = []
    changelog = (root / 'CHANGELOG.md').read_text(encoding='utf-8')
    if f'## {version}' not in changelog:
        issues.append(f'CHANGELOG.md is missing heading "## {version}"')
    release_md = (root / 'GITHUB_RELEASE.md').read_text(encoding='utf-8')
    if f'v{version}' not in release_md:
        issues.append(f'GITHUB_RELEASE.md does not mention "v{version}"')
    return issues


def main(argv=None):
    args = parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    base_version = read_json(root / 'plugin.json')['version']
    target = args.version.lstrip('v') if args.version else base_version

    if not SEMVER_RE.match(target):
        print(f'Invalid semver version: {target}', file=sys.stderr)
        return 2

    mismatches = []
    changed = []
    for rel in VERSION_FILES:
        path = root / rel
        if args.check:
            current = read_json(path).get('version')
            if current != target:
                mismatches.append(f'{rel}: {current} != {target}')
        else:
            prev, updated = update_version_file(path, target, write=True)
            if updated:
                changed.append(f'{rel}: {prev} -> {target}')

    if mismatches:
        print('Version mismatches found:', file=sys.stderr)
        for item in mismatches:
            print(f'  - {item}', file=sys.stderr)
        return 1

    if changed:
        print('Updated versions:')
        for item in changed:
            print(f'  - {item}')
    else:
        print(f'All version files already at {target}.')

    issues = check_notes(root, target)
    if issues:
        print('Release notes preflight warnings:', file=sys.stderr)
        for issue in issues:
            print(f'  - {issue}', file=sys.stderr)
        if args.check:
            return 1

    if not args.check:
        print(f'\nNext steps for v{target}:')
        print(f'  1. Update CHANGELOG.md (## {target}) and GITHUB_RELEASE.md (v{target}) if needed.')
        print(f'  2. Run: python tools/prepare-release.py {target} --check')
        print(f'  3. Commit on dev, open PR dev -> main, merge after CI passes.')
        print(f'  4. On main: git tag v{target} && git push origin v{target}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
