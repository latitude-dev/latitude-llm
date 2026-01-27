# Latitude SDK for Python

```sh
pip install latitude-sdk
```

Requires Python `3.9` through `3.14`.

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

Find more [examples](https://docs.latitude.so/examples/sdk).

## Development

Requires uv `0.8.17` or higher.

- Install dependencies: `uv venv && uv sync --all-extras --all-groups`
- Add [dev] dependencies: `uv add [--dev] <package>`
- Run linter: `uv run scripts/lint.py`
- Run formatter: `uv run scripts/format.py`
- Run tests: `uv run scripts/test.py`
- Build package: `uv build`
- Publish package: `uv publish`

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

## Releases

This SDK is automatically published to pypi and GitHub releases when changes are pushed to the main branch with a new version number.

### Creating a Release

1. **Update the changelog**: Edit `CHANGELOG.md` to add your new version with release notes
2. **Bump the version**: Update the version in `pyproject.toml`
3. **Push to main**: The GitHub Action will automatically:
   - Build and test the package
   - Publish to pypi
   - Create a GitHub release with changelog content
   - Tag the release as `python-sdk-VERSION`

See `CHANGELOG_TEMPLATE.md` for detailed instructions on updating the changelog.

## License

The SDK is licensed under the [MIT License](https://opensource.org/licenses/MIT) - read the [LICENSE](/LICENSE) file for details.
