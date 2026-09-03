"""Bring a Latitude V1 golden dataset into a V2 dataset.

V1 datasets were CSVs whose columns mirrored the prompt's parameters plus a
label column. V2 rows have input / output / expected_output / metadata. Map the
parameter columns into `input`, the label into `expected_output`, and keep the
rest as metadata. The same call is available as the MCP tool `insertDatasetRows`.

    python -m scripts.import_v1_dataset datasets/grammar-golden.csv grammar-regressions
"""
import csv
import os
import sys

from dotenv import load_dotenv
from latitude_sdk import LatitudeClient

load_dotenv()

PARAMS = ("text", "language")
LABEL = "expected_output"


def main(csv_path: str, dataset_slug: str) -> int:
    client = LatitudeClient(api_key=os.environ["LATITUDE_API_KEY"])
    project = os.environ["LATITUDE_PROJECT_SLUG"]
    with open(csv_path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    payload = [
        {
            "input": {k: r[k] for k in PARAMS},
            "expectedOutput": r[LABEL],
            "metadata": {"source": "latitude-v1-golden-dataset", "file": os.path.basename(csv_path)},
        }
        for r in rows
    ]
    client.datasets.insert_rows(project, dataset_slug, rows=payload)
    print(f"inserted {len(payload)} rows into {project}/{dataset_slug}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
