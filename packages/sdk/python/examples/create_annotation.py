# Minimal example: create a published annotation via the SDK using an explicit
# trace id.
#
# From `packages/sdk/python` (after `uv sync`):
#   uv run --env-file examples/.env python examples/create_annotation.py

from _env import optional_env, require_env

from latitude_sdk import LatitudeApiClient, TraceRef_Id

client = LatitudeApiClient(
    base_url=optional_env("LATITUDE_API_BASE_URL"),
    token=require_env("LATITUDE_API_KEY"),
)

annotation = client.annotations.create(
    require_env("LATITUDE_PROJECT_SLUG"),
    value=1,
    passed=True,
    feedback="Good response — written from the SDK example",
    trace=TraceRef_Id(id=require_env("LATITUDE_TRACE_ID")),
)

print("Created annotation:")
print(annotation.model_dump_json(indent=2))
