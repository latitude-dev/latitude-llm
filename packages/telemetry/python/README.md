# Latitude Telemetry for Python

```sh
pip install latitude-telemetry
```

Requires Python `3.11` through `3.14`.

Go to the [documentation](https://docs.latitude.so/guides/sdk/python#telemetry) to learn more.

## Usage

```python
from latitude_telemetry import Instrumentors, Telemetry, TelemetryOptions
from openai import OpenAI

telemetry = Telemetry("my-api-key", TelemetryOptions(
    instrumentors=[
        Instrumentors.OpenAI,
    ],
))

openai = OpenAI(api_key="my-api-key")
openai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello, I'm being instrumented!"}],
)
```

Find more [examples](https://github.com/latitude-dev/latitude-llm/tree/main/examples/sdks/python/telemetry).

## Development

Requires uv `0.5.10` or higher.

- Install dependencies: `uv venv && uv sync --all-extras --all-groups`
- Add [dev] dependencies: `uv add [--dev] <package>`
- Run linter: `uv run scripts/lint.py`
- Run formatter: `uv run scripts/format.py`
- Run tests: `uv run scripts/test.py`
- Build package: `uv build`
- Publish package: `uv publish`

## License

The Telemetry is licensed under the [LGPL-3.0 License](https://opensource.org/licenses/LGPL-3.0) - read the [LICENSE](/LICENSE) file for details.
