"""CLI: ``python -m latitude_telemetry_prime_intellect export <results_dir>``."""

from __future__ import annotations

import argparse
import sys

from .config import _config, _debug
from .export import export_results_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="latitude-prime-intellect-export",
        description="Export Verifiers eval results (JSONL) to Latitude as OTLP traces.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    export_p = sub.add_parser("export", help="Export a results directory or .jsonl file")
    export_p.add_argument("path", help="Results directory or .jsonl file from a Verifiers eval run")
    export_p.add_argument(
        "--no-scores",
        action="store_true",
        help="Skip posting reward/metric scores to the Latitude Scores API",
    )

    args = parser.parse_args(argv)
    if args.command == "export":
        cfg = _config()
        if not cfg["enabled"]:
            print(
                "Missing LATITUDE_API_KEY / LATITUDE_PROJECT — set both before exporting.",
                file=sys.stderr,
            )
            return 2
        ids = export_results_dir(args.path, export_scores=not args.no_scores, flush=True)
        _debug(f"exported {len(ids)} trace(s)")
        print(f"Exported {len(ids)} trace(s) to project {cfg['project']}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
