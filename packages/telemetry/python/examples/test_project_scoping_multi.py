"""
Project scoping — multi-project per-capture override.

`Latitude(api_key=...)` is initialized *without* a default `project_slug`. Every `capture()`
must declare its own `project_slug` and spans are routed per-capture via the
`latitude.project` span attribute. Use this when a single process emits to several Latitude
projects (e.g. multiple agents sharing one runtime).

Both projects must exist in the org behind `LATITUDE_API_KEY`. The slugs below default to
`primary` / `secondary` to match what `pnpm --filter @tools/live-seeds seed:multi-project-demo`
provisions — run that once first and this example works without any UI clicks. Or override
via `LATITUDE_PRIMARY_PROJECT_SLUG` / `LATITUDE_SECONDARY_PROJECT_SLUG` to target your own.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Optional env vars:
- LATITUDE_PRIMARY_PROJECT_SLUG    (defaults to "primary")
- LATITUDE_SECONDARY_PROJECT_SLUG  (defaults to "secondary")

Install: uv add openai
Run from `packages/telemetry/python/`:
    uv run --env-file examples/.env python examples/test_project_scoping_multi.py
"""

import os

from openai import OpenAI

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    instrumentations=["openai"],
    disable_batch=True,
)

FULL_STACK_AGENT_SLUG = os.environ.get("LATITUDE_PRIMARY_PROJECT_SLUG", "primary")
CALL_SUMMARISER_SLUG = os.environ.get("LATITUDE_SECONDARY_PROJECT_SLUG", "secondary")


@capture(
    "full-stack-agent-run",
    {"project_slug": FULL_STACK_AGENT_SLUG, "tags": ["agent:full-stack"]},
)
def run_full_stack_agent() -> None:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Ship feature X — what's step 1? Reply in 5 words."}],
        max_tokens=30,
    )
    print("full-stack-agent →", r.choices[0].message.content)


@capture(
    "call-summariser-run",
    {"project_slug": CALL_SUMMARISER_SLUG, "tags": ["agent:summariser"]},
)
def run_call_summariser() -> None:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Summarize: 'Customer asked for refund.' in 4 words."}],
        max_tokens=30,
    )
    print("call-summariser →", r.choices[0].message.content)


def main() -> None:
    run_full_stack_agent()
    run_call_summariser()

    # Spans with no `project_slug` AND no ctor default are rejected by the ingest service
    # with a `partial_success` body — exporters log the rejection but don't retry. Always
    # set a slug either on the ctor or on each `capture()` when running this pattern.

    latitude.flush()


if __name__ == "__main__":
    main()
