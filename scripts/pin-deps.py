#!/usr/bin/env python3
"""Pin every npm caret/tilde range and every PyPI loose-range dep to the
exact version currently resolved by the lockfile.

Reads pnpm-lock.yaml and each uv.lock; rewrites every package.json's
dependencies / devDependencies / optionalDependencies (peerDependencies are
left flexible by design) and every pyproject.toml's [project].dependencies +
[dependency-groups].* entries to use exact pins.

Safe to re-run — idempotent. Combine with `.npmrc save-exact=true` and
`[tool.uv].exclude-newer = "7d"` to keep manifests honest going forward.

Usage:  scripts/pin-deps.py [--check] [--npm-only|--pypi-only] [repo-root]
Exit:   0 = nothing left to pin (or pinning succeeded), 1 = --check found drift, 2 = usage
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

NPM_SKIP_PREFIXES = (
    "catalog:", "workspace:", "file:", "link:", "git+",
    "http://", "https://", "npm:",
)

EXCLUDED_DIRS = {
    "node_modules", ".git", ".next", ".turbo", ".output",
    "dist", "build", ".venv", "site-packages",
}


def excluded(path: Path) -> bool:
    return bool(set(path.parts) & EXCLUDED_DIRS)


def normalize_pypi(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name.lower())


# ---------------------------------------------------------------- pnpm-lock --


def parse_pnpm_importers(path: Path) -> dict[str, dict[str, str]]:
    """Return {importer_path: {dep_name: resolved_version}} from pnpm-lock.yaml.

    Indent-based parser tuned to pnpm-lock.yaml v9/v10 format. Avoids needing
    PyYAML / ruamel as a build dep.
    """
    importers: dict[str, dict[str, str]] = {}
    in_importers = False
    importer: str | None = None
    section: str | None = None
    pkg: str | None = None

    for raw in path.read_text().splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        body = raw.strip()

        if indent == 0:
            in_importers = body.rstrip(":") == "importers"
            importer = section = pkg = None
            continue
        if not in_importers:
            continue

        if indent == 2:
            importer = body.rstrip(":").strip("'\"")
            importers.setdefault(importer, {})
            section = pkg = None
            continue
        if importer is None:
            continue

        if indent == 4:
            name = body.rstrip(":").strip()
            section = name if name in {"dependencies", "devDependencies", "optionalDependencies"} else None
            pkg = None
            continue
        if section is None:
            continue

        if indent == 6:
            pkg = body.rstrip(":").strip("'\"")
            continue
        if pkg is None:
            continue

        if indent == 8 and body.startswith("version:"):
            ver = body[len("version:") :].strip().strip("'\"")
            if "(" in ver:                       # strip peer-dep tail
                ver = ver[: ver.index("(")]
            importers[importer][pkg] = ver

    return importers


def pin_package_json(pj: Path, deps_map: dict[str, str], dry_run: bool) -> int:
    raw = pj.read_text()
    data = json.loads(raw)
    changes = 0
    for sec in ("dependencies", "devDependencies", "optionalDependencies"):
        block = data.get(sec)
        if not isinstance(block, dict):
            continue
        for name, spec in list(block.items()):
            if not isinstance(spec, str):
                continue
            if any(spec.startswith(p) for p in NPM_SKIP_PREFIXES):
                continue
            if not (spec.startswith("^") or spec.startswith("~")):
                continue
            resolved = deps_map.get(name) or spec.lstrip("^~").strip()
            if resolved != spec:
                block[name] = resolved
                changes += 1
    if changes and not dry_run:
        out = json.dumps(data, indent=2, ensure_ascii=False)
        if raw.endswith("\n"):
            out += "\n"
        pj.write_text(out)
    return changes


def run_npm(root: Path, dry_run: bool) -> int:
    lockfile = root / "pnpm-lock.yaml"
    if not lockfile.exists():
        print(f"  ! no pnpm-lock.yaml at {lockfile}", file=sys.stderr)
        return 0
    importers = parse_pnpm_importers(lockfile)
    pjs = sorted(p for p in root.rglob("package.json") if not excluded(p))
    total = 0
    files = 0
    for pj in pjs:
        rel = pj.parent.relative_to(root).as_posix() or "."
        changes = pin_package_json(pj, importers.get(rel, {}), dry_run)
        if changes:
            files += 1
            total += changes
            verb = "would pin" if dry_run else "pinned"
            print(f"  {verb} {changes:3d}  {pj.relative_to(root)}")
    print(f"\nnpm: {'would pin' if dry_run else 'pinned'} {total} ranges across {files} package.json files")
    return total


# -------------------------------------------------------------------- pypi --


def parse_uv_lock(path: Path) -> dict[str, str]:
    with open(path, "rb") as f:
        data = tomllib.load(f)
    return {
        normalize_pypi(pkg["name"]): pkg["version"]
        for pkg in data.get("package", [])
        if "name" in pkg and "version" in pkg
    }


DEP_HEAD = re.compile(r"^([A-Za-z0-9_.\-]+)(\[[^\]]+\])?(.*)$")
LOOSE_OP = re.compile(r"(>=|>|~=|<=|<)")


def pin_pyproject(py: Path, uv_resolved: dict[str, str], dry_run: bool) -> int:
    with open(py, "rb") as f:
        data = tomllib.load(f)
    raw = py.read_text()

    deps: list[str] = []
    deps.extend(data.get("project", {}).get("dependencies", []) or [])
    for group in (data.get("dependency-groups") or {}).values():
        if isinstance(group, list):
            deps.extend(group)

    replacements: dict[str, str] = {}
    for dep_str in deps:
        if not isinstance(dep_str, str):
            continue
        m = DEP_HEAD.match(dep_str)
        if not m:
            continue
        name, extras, spec = m.group(1), m.group(2) or "", (m.group(3) or "").strip()
        if not spec or "==" in spec:
            continue
        if not LOOSE_OP.search(spec):
            continue
        resolved = uv_resolved.get(normalize_pypi(name))
        if not resolved:
            print(f"  ! {py}: {name} not in uv.lock; skipping", file=sys.stderr)
            continue
        new_dep = f"{name}{extras}=={resolved}"
        if new_dep != dep_str:
            replacements[dep_str] = new_dep

    if not replacements:
        return 0

    new_raw = raw
    for old, new in replacements.items():
        new_raw = new_raw.replace(f'"{old}"', f'"{new}"', 1)
    if not dry_run:
        py.write_text(new_raw)
    return len(replacements)


def run_pypi(root: Path, dry_run: bool) -> int:
    pyprojects = sorted(p for p in root.rglob("pyproject.toml") if not excluded(p))
    total = 0
    files = 0
    for py in pyprojects:
        uv_lock = py.parent / "uv.lock"
        if not uv_lock.exists():
            continue
        resolved = parse_uv_lock(uv_lock)
        changes = pin_pyproject(py, resolved, dry_run)
        if changes:
            files += 1
            total += changes
            verb = "would pin" if dry_run else "pinned"
            print(f"  {verb} {changes:3d}  {py.relative_to(root)}")
    print(f"pypi: {'would pin' if dry_run else 'pinned'} {total} ranges across {files} pyproject.toml files")
    return total


# -------------------------------------------------------------------- main --


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Dry run; exit 1 if any range would change")
    p.add_argument("--npm-only", action="store_true")
    p.add_argument("--pypi-only", action="store_true")
    p.add_argument("root", nargs="?", default=".", help="Repo root (default: cwd)")
    args = p.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"root not a directory: {root}", file=sys.stderr)
        return 2

    npm_total = pypi_total = 0
    if not args.pypi_only:
        npm_total = run_npm(root, args.check)
    if not args.npm_only:
        pypi_total = run_pypi(root, args.check)

    if args.check:
        return 1 if (npm_total + pypi_total) > 0 else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
