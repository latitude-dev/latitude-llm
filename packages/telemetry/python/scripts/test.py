import sys

from sh import pytest  # type: ignore

files = sys.argv[1:] or ["."]

pytest(*files, _out=sys.stdout)
