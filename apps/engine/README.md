# Latitude AI Engine

Requires Python `3.13` or higher.

## Development

Requires uv `0.8.17` or higher.

- Install dependencies: `uv venv && uv sync --all-extras --all-groups`
- Add [dev] dependencies: `uv add [--dev] <package>`
- Run linter: `uv run scripts/lint.py`
- Run formatter: `uv run scripts/format.py`
- Run tests: `uv run scripts/test.py`

### Running only a specific test

Specify the test inline:

```python
uv run scripts/test.py <test_path>::<test_case>::<test_name>
```

Or mark the test with an `only` marker:

```python
import pytest

@pytest.mark.only
async def my_test(self):
    # ... your code
```

...and then run the tests with the marker `only`:

```sh
uv run scripts/test.py -m only
```
