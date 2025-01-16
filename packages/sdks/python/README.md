# Latitude SDK for Python

```sh
pip install latitude-sdk
```

Requires Python `3.9` or higher.

Go to the [documentation](https://docs.latitude.so/guides/sdk/python) to learn more.

## Usage

```python
from latitude_sdk import Latitude, LatitudeOptions, RunPromptOptions

sdk = Latitude("my-api-key", LatitudeOptions(
    project_id="my-project-id",
    version_uuid="my-version-uuid",
))

await sdk.prompts.run("joke-teller", RunPromptOptions(
    parameters={"topic": "Python"},
    on_event=lambda event: print(event),
    on_finished=lambda event: print(event),
    on_error=lambda error: print(error),
    stream=True,
))
```

Find more [examples](https://github.com/latitude-dev/latitude-llm/tree/main/examples/sdks/python).

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

The SDK is licensed under the [LGPL-3.0 License](https://opensource.org/licenses/LGPL-3.0) - read the [LICENSE](/LICENSE) file for details.
