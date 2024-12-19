import sys

from sh import ruff  # type: ignore

files = sys.argv[1:] or ["."]

ruff("check", "--fix", *files, _out=sys.stdout)
ruff("format", *files, _out=sys.stdout)
