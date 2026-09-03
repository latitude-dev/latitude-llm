"""Replay the V2 dataset against the live agent (V1 called this a batch evaluation).

Pulls every row of the dataset with the Latitude SDK, runs the grammar check on
each input, and asserts the expected correction is produced. Each replay is
tagged `simulation` so it never counts as production traffic, and tagged with
the agent version so an Experiment can compare releases.

    LATITUDE_DATASET_SLUG=grammar-regressions pytest -q
"""
import os
import uuid

import pytest
from dotenv import load_dotenv
from latitude_sdk import LatitudeClient

from app.telemetry import latitude  # import before app.services, which constructs the Anthropic client
from app import prompts, services

load_dotenv()

PROJECT = os.environ["LATITUDE_PROJECT_SLUG"]
DATASET = os.environ.get("LATITUDE_DATASET_SLUG", "grammar-regressions")
RUN_ID = os.environ.get("SIMULATION_RUN_ID", uuid.uuid4().hex[:8])


def _rows():
    client = LatitudeClient(api_key=os.environ["LATITUDE_API_KEY"])
    cursor, out = None, []
    while True:
        page = client.datasets.list_rows(PROJECT, DATASET, cursor=cursor, limit=200)
        out.extend(page.items)
        if not page.has_more or not page.next_cursor:
            return out
        cursor = page.next_cursor


def _text_and_language(row_input):
    """Rows inserted from the V1 CSV carry {text, language}; rows imported from
    traces carry the GenAI message list. Handle both."""
    if isinstance(row_input, dict) and "text" in row_input:
        return row_input["text"], row_input.get("language", "English")
    raw = row_input
    if isinstance(row_input, list):
        user = next((m for m in row_input if isinstance(m, dict) and m.get("role") == "user"), {})
        parts = user.get("parts") or user.get("content") or ""
        raw = " ".join(p.get("content", "") for p in parts if isinstance(p, dict)) if isinstance(parts, list) else parts
    language, text = "English", str(raw)
    for line in str(raw).splitlines():
        if line.startswith("Language:"):
            language = line.split(":", 1)[1].strip()
        if line.startswith("Text:"):
            text = line.split(":", 1)[1].strip()
    return text, language


def _apply(text: str, corrections: list[dict]) -> str:
    """The coach returns fragment-level corrections; apply them to get the full sentence."""
    for c in corrections:
        text = text.replace(c["original"], c["corrected"])
    return text


def _norm(s: str) -> str:
    return " ".join(str(s).lower().replace("\u00a0", " ").split()).rstrip(".")


def _also_accepts_column():
    client = LatitudeClient(api_key=os.environ["LATITUDE_API_KEY"])
    cols = client.datasets.list_columns(PROJECT, DATASET).columns
    return next((c.identifier for c in cols if c.name == "alsoAccepts"), None)


ROWS = [r for r in _rows() if r.expected_output]
if not ROWS:
    raise RuntimeError(f"No rows with expected_output in {PROJECT}/{DATASET}, so the regression suite would not test anything")
ALSO_ACCEPTS = _also_accepts_column()


@pytest.fixture(scope="session", autouse=True)
def _flush():
    yield
    latitude.flush()
    latitude.shutdown()


@pytest.mark.parametrize("row", ROWS, ids=[r.row_id for r in ROWS])
def test_grammar_regression(row):
    text, language = _text_and_language(row.input)
    result = services.check_grammar(
        text,
        language,
        user_id="regression-suite",
        session_id=f"sim-{RUN_ID}-{row.row_id}",
        tags=["simulation", f"agent-{prompts.APP_RELEASE}"],
        metadata={"dataset": DATASET, "rowId": row.row_id, "runId": RUN_ID},
    )
    produced = _apply(text, result["corrections"])
    # A row can list equally valid answers in the custom `alsoAccepts` column.
    also = (row.custom or {}).get(ALSO_ACCEPTS) or [] if ALSO_ACCEPTS else []
    accepted = {_norm(row.expected_output), *(_norm(a) for a in also)}
    assert _norm(produced) in accepted, (
        f"expected one of {sorted(accepted)}, got {produced!r} via corrections={result['corrections']}"
    )
