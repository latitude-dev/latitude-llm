# Variant: resolve the target trace by a `FilterSet` instead of by explicit
# id. Useful when the caller knows a business attribute (e.g. `sessionId`)
# but not the raw OTel trace id. Exactly one trace must match — 0 → 404,
# 2+ → 400.
#
# From `packages/sdk/python` (after `uv sync`):
#   uv run --env-file examples/.env python examples/create_annotation_by_filter.py

from _env import optional_env, require_env

from latitude_sdk import FilterCondition, LatitudeClient, TraceRef_Filters

client = LatitudeClient(
    base_url=optional_env("LATITUDE_API_BASE_URL"),
    api_key=require_env("LATITUDE_API_KEY"),
)

annotation = client.annotations.create(
    require_env("LATITUDE_PROJECT_SLUG"),
    value=1,
    passed=True,
    feedback="Annotation resolved via session-id filter",
    trace=TraceRef_Filters(
        filters={"sessionId": [FilterCondition(op="eq", value=require_env("LATITUDE_SESSION_ID"))]},
    ),
)

print("Created annotation via filter:")
print(annotation.model_dump_json(indent=2))
