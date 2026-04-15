"""
Test nested capture() context merging.

This verifies that nested capture() calls correctly merge context:
- tags: merge and deduplicate
- metadata: shallow merge (child overrides parent for same keys)
- session_id/user_id: last-write-wins

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
    "outer-capture",
    {
        "tags": ["outer-tag", "shared-tag"],
        "session_id": "outer-session",
        "user_id": "outer-user",
        "metadata": {"outer_key": "outer_value", "shared_key": "outer_shared"},
    },
)
def outer_function():
    """Outer capture with initial context."""
    client = OpenAI()

    # First LLM call in outer context
    response1 = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'First call' in exactly 2 words."}],
        max_tokens=50,
    )

    # Call inner function with nested capture
    inner_result = inner_function()

    # Second LLM call (should still have outer context)
    response2 = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Second call' in exactly 2 words."}],
        max_tokens=50,
    )

    return {
        "outer_response": response1.choices[0].message.content,
        "inner_response": inner_result,
        "second_outer_response": response2.choices[0].message.content,
    }


@capture(
    "inner-capture",
    {
        "tags": ["inner-tag", "shared-tag"],  # shared-tag should be deduplicated
        "session_id": "inner-session",  # should override outer-session
        "user_id": "inner-user",  # should override outer-user
        "metadata": {"inner_key": "inner_value", "shared_key": "inner_shared"},  # shared_key should be overridden
    },
)
def inner_function():
    """Inner capture with context that should merge with outer."""
    client = OpenAI()

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Inner call' in exactly 2 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


def test_nested_capture_with_callback():
    """Test nested capture using callback pattern."""

    def outer_callback():
        client = OpenAI()

        def inner_callback():
            inner_client = OpenAI()
            response = inner_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Say 'Callback inner' in exactly 2 words."}],
                max_tokens=50,
            )
            return response.choices[0].message.content

        # Inner capture with callback pattern
        inner_result = capture(
            "callback-inner",
            inner_callback,
            {
                "tags": ["callback-inner"],
                "session_id": "callback-inner-session",
                "user_id": "callback-inner-user",
                "metadata": {"callback_inner": "value"},
            },
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Say 'Callback outer' in exactly 2 words."}],
            max_tokens=50,
        )

        return {
            "inner": inner_result,
            "outer": response.choices[0].message.content,
        }

    return capture(
        "callback-outer",
        outer_callback,
        {
            "tags": ["callback-outer"],
            "session_id": "callback-outer-session",
            "user_id": "callback-outer-user",
            "metadata": {"callback_outer": "value"},
        },
    )


if __name__ == "__main__":
    print("Testing nested capture with decorators...")
    result1 = outer_function()
    print(f"Decorator result: {result1}")

    print("\nTesting nested capture with callbacks...")
    result2 = test_nested_capture_with_callback()
    print(f"Callback result: {result2}")

    latitude["flush"]()
    print("\nDone! Check Latitude dashboard for context merging verification.")
