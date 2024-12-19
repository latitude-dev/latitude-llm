import sys

from sh import pytest  # type: ignore

files = sys.argv[1:] or ["."]

pytest("test", "-p", "no:warnings", "-n", "auto", *files, _out=sys.stdout)
