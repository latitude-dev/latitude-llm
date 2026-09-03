# LinguaAI on Latitude V2

The same language-tutor API that ran on Latitude V1 (prompt manager + gateway), moved to V2:
prompts in code, direct Anthropic calls, Latitude observing through telemetry.

```bash
uv venv --python 3.13 .venv && uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env   # fill in ANTHROPIC_API_KEY, LATITUDE_API_KEY, LATITUDE_PROJECT_SLUG

.venv/bin/uvicorn app.main:app --reload         # the API
APP_RELEASE=2.0.0 .venv/bin/python -m scripts.smoke   # realistic traffic, release 2.0.0
APP_RELEASE=2.1.0 .venv/bin/python -m scripts.smoke   # same traffic, release 2.1.0
.venv/bin/python -m scripts.import_v1_dataset datasets/grammar-golden.csv grammar-regressions
LATITUDE_DATASET_SLUG=grammar-regressions .venv/bin/pytest -q
```

| Path | What it is |
| --- | --- |
| `app/telemetry.py` | `Latitude(...)` bootstrap, imported before the Anthropic client |
| `app/prompts.py` | the two V1 PromptL documents, now Python templates with version strings |
| `app/services.py` | one `capture()` per use case: user, session, tags, release metadata |
| `scripts/smoke.py` | twelve learner requests across three users and five sessions |
| `datasets/grammar-golden.csv` | the V1 golden dataset export |
| `scripts/import_v1_dataset.py` | V1 CSV -> V2 dataset rows (`insertDatasetRows`) |
| `tests/test_regression.py` | dataset replay tagged `simulation` (the V1 batch evaluation) |
