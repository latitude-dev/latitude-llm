#!/usr/bin/env python3
"""
Parse GitHub PR check failures and categorize them for automated fixing.
Usage: gh pr checks --json | python3 parse_failures.py
"""

import json
import sys
from typing import Any


def categorize_failure(check_name: str, output: str | None) -> str:
    """Categorize a failed check based on name and output."""
    check_lower = check_name.lower()
    
    # Type/lint checks
    if any(kw in check_lower for kw in ['typecheck', 'type-check', 'pyright', 'mypy', 'tsgo']):
        return 'type_error'
    if any(kw in check_lower for kw in ['lint', 'check', 'biome', 'eslint', 'ruff']):
        return 'lint_error'
    
    # Test failures
    if any(kw in check_lower for kw in ['test', 'pytest', 'vitest', 'jest']):
        return 'test_failure'
    
    # Build failures
    if any(kw in check_lower for kw in ['build', 'bundle', 'compile', 'webpack', 'vite']):
        return 'build_failure'
    
    return 'unknown'


def parse_gh_checks_json(data: list[dict[str, Any]]) -> dict[str, list[dict]]:
    """Parse gh pr checks --json output and categorize failures."""
    failures = {
        'type_error': [],
        'lint_error': [],
        'test_failure': [],
        'build_failure': [],
        'unknown': []
    }
    
    for check in data:
        if check.get('state') == 'FAILURE':
            category = categorize_failure(check.get('name', ''), check.get('output'))
            failures[category].append({
                'name': check.get('name'),
                'link': check.get('link'),
                'output': check.get('output', '')[:500]  # Truncate long output
            })
    
    return failures


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("Error: Could not parse JSON from stdin", file=sys.stderr)
        sys.exit(1)
    
    if not isinstance(data, list):
        print("Error: Expected JSON array", file=sys.stderr)
        sys.exit(1)
    
    failures = parse_gh_checks_json(data)
    
    # Print summary
    total_failures = sum(len(v) for v in failures.values())
    if total_failures == 0:
        print("✓ All checks passed!")
        sys.exit(0)
    
    print(f"Found {total_failures} failed check(s):\n")
    
    for category, checks in failures.items():
        if not checks:
            continue
        
        emoji = {
            'type_error': '🔍',
            'lint_error': '🧹',
            'test_failure': '🧪',
            'build_failure': '🔨',
            'unknown': '❓'
        }.get(category, '⚠️')
        
        print(f"{emoji} {category.replace('_', ' ').title()}: {len(checks)}")
        for check in checks:
            print(f"   - {check['name']}")
            if check['link']:
                print(f"     {check['link']}")
        print()
    
    # Output JSON for programmatic use
    print("\n---JSON---")
    print(json.dumps(failures, indent=2))


if __name__ == '__main__':
    main()
