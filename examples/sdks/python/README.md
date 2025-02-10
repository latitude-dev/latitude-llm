# Python SDK examples

Theses examples are written in Python and use the Latitude SDK for Python.

## Development

Requires uv `0.5.10` or higher.

- Install dependencies: `uv venv && uv sync --all-extras --all-groups`
- Add [dev] dependencies: `uv add [--dev] <package>`

## TROUBLESHOOTING REFRESHING latitude-sdk

We use a local version of the SDK, but "uv" ends up caching the package and it needs to be refreshed.

```bash
uv cache clean
rm -rf .venv/
```
