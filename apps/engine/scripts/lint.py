import sys

from sh import pyright, ruff  # type: ignore

files = sys.argv[1:] or ["."]

pyright(*files, _out=sys.stdout)
ruff("check", *files, _out=sys.stdout)
ruff("format", "--check", *files, _out=sys.stdout)
