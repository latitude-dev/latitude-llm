import sys

from sh import pytest  # type: ignore

files = sys.argv[1:] or ["./tests"]

pytest("-rs", *files, _out=sys.stdout)
