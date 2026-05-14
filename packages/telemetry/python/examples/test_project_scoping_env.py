"""
Project scoping — env-driven default + per-capture override.

Reads the default project slug from `LATITUDE_PROJECT_SLUG` and lets specific captures
override it via `capture({"project_slug": ...})`. A common shape for services that run in
many environments (staging/prod each have their own project slug) but still need to route
a subset of spans elsewhere.

Resolution precedence (highest → lowest):
  1. capture({"project_slug": ...})         — emits `latitude.project` on the span
  2. OTEL resource attribute `latitude.project`  — bare-OTEL setups
  3. ctor `project_slug`                    — sent as `X-Latitude-Project` header

The override slug (`evaluation-runs` below) must exist in the same org as `LATITUDE_API_KEY`.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG  (env-driven default for the ctor)
- OPENAI_API_KEY

Install: uv add openai
Run from `packages/telemetry/python/`:
    uv run --env-file examples/.env python examples/test_project_scoping_env.py
"""

import os

from openai import OpenAI

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai"],
    disable_batch=True,
)

OVERRIDE_SLUG = "evaluation-runs"


@capture("default-route")
def default_route() -> None:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Reply with 'default' in one word."}],
        max_tokens=10,
    )
    print("default-route →", r.choices[0].message.content)


@capture("evaluation-batch", {"project_slug": OVERRIDE_SLUG})
def evaluation_batch() -> None:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Reply with 'override' in one word."}],
        max_tokens=10,
    )
    print(f"{OVERRIDE_SLUG} →", r.choices[0].message.content)


def main() -> None:
    default_route()
    evaluation_batch()
    latitude.flush()


if __name__ == "__main__":
    main()
