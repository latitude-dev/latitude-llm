# LinguaAI: Latitude V1 to V2

Companion code for the [Migrate from Latitude V1](https://docs.latitude.so/getting-started/migrate-from-v1) guide.

| Folder | What it is |
| --- | --- |
| `before/linguaai` | The V1 app: FastAPI routes calling `sdk.prompts.run()` on `latitude-sdk` 5.x, plus the PromptL documents and an inventory of the V1 control plane |
| `after/linguaai` | The V2 app: prompts in code, direct Anthropic calls, `latitude-telemetry` with one `capture()` per use case, a smoke driver, a V1 CSV importer, and a pytest regression replay |

```bash
cd after/linguaai
uv venv --python 3.13 .venv && uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env   # ANTHROPIC_API_KEY, LATITUDE_API_KEY, LATITUDE_PROJECT_SLUG
APP_RELEASE=2.0.0 .venv/bin/python -m scripts.smoke
APP_RELEASE=2.1.0 .venv/bin/python -m scripts.smoke
.venv/bin/python -m scripts.import_v1_dataset datasets/grammar-golden.csv grammar-regressions
LATITUDE_DATASET_SLUG=grammar-regressions .venv/bin/pytest -q
```
