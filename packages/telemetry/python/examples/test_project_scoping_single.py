"""
Project scoping — single-project default (existing pattern).

`Latitude(api_key=..., project_slug=...)` sets a default project for every span. `capture()`
inherits it, so all spans land in the same Latitude project. This is the recommended setup
for processes that emit to one project.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai
Run from `packages/telemetry/python/`:
    uv run --env-file examples/.env python examples/test_project_scoping_single.py
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


@capture("greet")
def greet() -> None:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Hello!' in exactly 2 words."}],
        max_tokens=20,
    )
    print("greet →", r.choices[0].message.content)


@capture("summarize", {"tags": ["demo"]})
def summarize() -> None:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Summarize 'OpenAI is fun' in 3 words."}],
        max_tokens=20,
    )
    print("summarize →", r.choices[0].message.content)


def main() -> None:
    greet()
    summarize()
    latitude.flush()


if __name__ == "__main__":
    main()
