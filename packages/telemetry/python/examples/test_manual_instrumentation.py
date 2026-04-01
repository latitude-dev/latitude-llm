"""
Test manual span creation within capture() boundaries.

This verifies that manually created spans (using OpenTelemetry's tracer directly)
receive latitude.* attributes from the capture() context and pass the smart filter.

This is the pattern for adding custom spans around non-LLM operations while keeping
them within a Latitude trace.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai
"""

import os

from openai import OpenAI

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai"],
    disable_batch=True,
)


@capture(
    "agent-with-custom-spans",
    {
        "tags": ["manual-instrumentation", "test"],
        "session_id": "manual-test-session",
        "user_id": "manual-test-user",
        "metadata": {"agent_type": "custom-span-test"},
    },
)
def agent_with_manual_spans():
    """
    Demonstrates creating custom spans inside capture().

    The custom span will receive latitude.* attributes from capture()
    and pass the smart filter.
    """
    # DEBUG: Check if we have a current span
    from opentelemetry import trace

    current_span = trace.get_current_span()
    is_recording = current_span.is_recording() if current_span else False
    print(f"DEBUG agent_with_manual_spans: current_span={current_span}, is_recording={is_recording}")

    # Get tracer from the provider - this is a standard OTel tracer
    tracer = latitude["provider"].get_tracer("custom.manual.instrumentation")

    # Create a custom span for a non-LLM operation
    # This span will receive latitude.tags, latitude.metadata, etc.
    # from LatitudeSpanProcessor and pass the smart filter
    with tracer.start_as_current_span("database.query") as span:
        span.set_attribute("db.system", "postgresql")
        span.set_attribute("db.statement", "SELECT * FROM users WHERE id = 123")

        # Simulate database work
        import time

        time.sleep(0.1)

        span.set_attribute("db.rows_affected", 1)

    # Another custom span for business logic
    with tracer.start_as_current_span("business.validate") as span:
        span.set_attribute("validation.rules_applied", ["email_format", "required_fields"])
        span.set_attribute("validation.result", "success")

    # Now make an LLM call - this will also be traced
    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Custom spans work!' in exactly 3 words."}],
        max_tokens=50,
    )

    # One more custom span for post-processing
    with tracer.start_as_current_span("response.format") as span:
        span.set_attribute("format.type", "markdown")
        span.set_attribute("format.includes_citations", False)

    return response.choices[0].message.content


@capture(
    "nested-capture-with-manual-spans",
    {
        "tags": ["nested-manual"],
        "session_id": "nested-session",
        "metadata": {"outer": True},
    },
)
def outer_with_manual_spans():
    """Outer capture with manual spans."""
    # DEBUG: Check if we have a current span
    from opentelemetry import trace

    current_span = trace.get_current_span()
    is_recording = current_span.is_recording() if current_span else False
    print(f"DEBUG outer_with_manual_spans: current_span={current_span}, is_recording={is_recording}")

    tracer = latitude["provider"].get_tracer("custom.manual.instrumentation")

    # Manual span in outer context
    with tracer.start_as_current_span("outer.preprocess") as span:
        span.set_attribute("preprocess.step", "data_loading")

    # Call inner function (also has capture)
    inner_result = inner_with_manual_spans()

    # Manual span after inner call
    with tracer.start_as_current_span("outer.postprocess") as span:
        span.set_attribute("postprocess.step", "result_formatting")

    return inner_result


@capture(
    "inner-capture-manual",
    {
        "tags": ["inner-manual"],
        "metadata": {"inner": True},
    },
)
def inner_with_manual_spans():
    """Inner capture with manual spans - context should merge."""
    # DEBUG: Check if we have a current span
    from opentelemetry import trace

    current_span = trace.get_current_span()
    is_recording = current_span.is_recording() if current_span else False
    print(f"DEBUG inner_with_manual_spans: current_span={current_span}, is_recording={is_recording}")

    tracer = latitude["provider"].get_tracer("custom.manual.instrumentation")

    # Manual span in inner context
    with tracer.start_as_current_span("inner.llm_prep") as span:
        span.set_attribute("prep.system_prompt_version", "v2.1")

    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Nested manual spans work!' in exactly 4 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


def test_manual_spans_with_callback():
    """Test manual span creation using callback pattern."""

    def agent_logic():
        # DEBUG: Check if we have a current span
        from opentelemetry import trace

        current_span = trace.get_current_span()
        is_recording = current_span.is_recording() if current_span else False
        print(f"DEBUG callback agent_logic: current_span={current_span}, is_recording={is_recording}")

        tracer = latitude["provider"].get_tracer("custom.manual.instrumentation")

        # Manual span in callback
        with tracer.start_as_current_span("callback.data_fetch") as span:
            span.set_attribute("data.source", "api")
            span.set_attribute("data.items_count", 42)

        client = OpenAI()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Say 'Callback manual spans work!' in exactly 4 words."}],
            max_tokens=50,
        )

        return response.choices[0].message.content

    return capture(
        "callback-manual-test",
        agent_logic,
        {
            "tags": ["callback-manual"],
            "session_id": "callback-session",
            "metadata": {"test_type": "callback"},
        },
    )


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Manual Span Creation within Capture()")
    print("=" * 60)

    print("\n1. Testing simple capture with manual spans...")
    result1 = agent_with_manual_spans()
    print(f"Result: {result1}")
    print("Expected spans: database.query, business.validate, response.format (all with latitude.* attributes)")

    print("\n2. Testing nested captures with manual spans...")
    result2 = outer_with_manual_spans()
    print(f"Result: {result2}")
    print("Expected spans: outer.preprocess, outer.postprocess, inner.llm_prep (with merged context)")

    print("\n3. Testing callback pattern with manual spans...")
    result3 = test_manual_spans_with_callback()
    print(f"Result: {result3}")
    print("Expected spans: callback.data_fetch (with latitude.* attributes)")

    print("\nFlushing telemetry...")
    latitude["flush"]()

    print("\n" + "=" * 60)
    print("Done! Check Latitude dashboard for verification:")
    print("=" * 60)
    print("- All custom spans should appear in the trace")
    print("- Custom spans should have latitude.tags, latitude.metadata attributes")
    print("- Nested spans should have merged context from parent captures")
    print("- Verify smart filter allows these spans through (latitude.* attribute check)")
