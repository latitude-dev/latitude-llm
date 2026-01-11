"""
Test DSPy instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- OPENAI_API_KEY

Install: uv add dspy
"""

import os

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry BEFORE importing dspy so instrumentation can patch it
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.DSPy],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)

# Import after telemetry is initialized
import dspy


# Define a simple DSPy signature
class SimpleQA(dspy.Signature):
    """Answer questions with short responses."""
    question: str = dspy.InputField()
    answer: str = dspy.OutputField()


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/dspy",
)
def test_dspy_completion():
    # Configure DSPy with OpenAI
    lm = dspy.LM("openai/gpt-4o-mini")
    dspy.configure(lm=lm)

    # Create a simple predictor
    qa = dspy.Predict(SimpleQA)

    result = qa(question="Say 'Hello from DSPy!' in exactly 5 words.")

    return result.answer


if __name__ == "__main__":
    print("Testing DSPy instrumentation...")
    result = test_dspy_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/dspy")
