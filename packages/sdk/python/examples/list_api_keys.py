# Minimal example: list the API keys for an organization via the SDK.
#
# Tokens are intentionally masked in the list response (the full `token`
# field is only included in the creation and detail responses — see
# `client.api_keys.create` / `client.api_keys.get`).
#
# From `packages/sdk/python` (after `uv sync`):
#   uv run --env-file examples/.env python examples/list_api_keys.py

from _env import optional_env, require_env

from latitude_sdk import LatitudeClient

client = LatitudeClient(
    base_url=optional_env("LATITUDE_API_BASE_URL"),
    api_key=require_env("LATITUDE_API_KEY"),
)

result = client.api_keys.list()

print(f"Found {len(result.api_keys)} API key(s):")
print(result.model_dump_json(indent=2))
