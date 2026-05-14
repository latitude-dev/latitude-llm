"""
Test DSPy instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add dspy
"""

import os

import dspy

from latitude_telemetry import Latitude, capture

# Initialize telemetry pointing to local instance
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"dspy": dspy},
    disable_batch=True,
)


# Define a simple DSPy signature
class SimpleQA(dspy.Signature):
    """Answer questions with short responses."""

    question: str = dspy.InputField()
    answer: str = dspy.OutputField()


@capture("test-dspy-completion", {"tags": ["python", "test"], "session_id": "example"})
def test_dspy_completion():
    # Configure DSPy with OpenAI
    lm = dspy.LM("openai/gpt-4o-mini")
    dspy.configure(lm=lm)

    # Create a simple predictor
    qa = dspy.Predict(SimpleQA)

    result = qa(question="Say 'Hello from DSPy!' in exactly 5 words.")

    return result.answer


if __name__ == "__main__":
    test_dspy_completion()
    latitude.flush()
