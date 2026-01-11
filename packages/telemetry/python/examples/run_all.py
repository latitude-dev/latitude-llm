#!/usr/bin/env python
"""
Run all or specific provider tests.

Usage:
    uv run python examples/run_all.py                    # Run all available tests
    uv run python examples/run_all.py openai anthropic   # Run specific tests
    uv run python examples/run_all.py --list             # List all tests
"""

import importlib.util
import os
import sys
from pathlib import Path

# Map of test names to their required env vars
TESTS = {
    "openai": ["OPENAI_API_KEY"],
    "anthropic": ["ANTHROPIC_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "mistral": ["MISTRAL_API_KEY"],
    "cohere": ["COHERE_API_KEY"],
    "together": ["TOGETHER_API_KEY"],
    "gemini": ["GEMINI_API_KEY"],
    "ollama": [],  # Local, no API key needed
    "litellm": ["OPENAI_API_KEY"],  # Using OpenAI as backend
    "replicate": ["REPLICATE_API_TOKEN"],
    "azure": ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    "bedrock": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    "vertex": ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT"],
    "sagemaker": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "SAGEMAKER_ENDPOINT_NAME"],
    "aleph_alpha": ["ALEPH_ALPHA_API_KEY"],
    "watsonx": ["WATSONX_API_KEY", "WATSONX_PROJECT_ID"],
    "transformers": [],  # Local, no API key needed
    "langchain": ["OPENAI_API_KEY"],
    "llamaindex": ["OPENAI_API_KEY"],
    "haystack": ["OPENAI_API_KEY"],
    "dspy": ["OPENAI_API_KEY"],
}


def check_common_env():
    """Check that common env vars are set."""
    missing = []
    if not os.environ.get("LATITUDE_API_KEY"):
        missing.append("LATITUDE_API_KEY")
    if not os.environ.get("LATITUDE_PROJECT_ID"):
        missing.append("LATITUDE_PROJECT_ID")
    return missing


def check_test_env(test_name: str) -> list[str]:
    """Check that required env vars for a test are set."""
    required = TESTS.get(test_name, [])
    return [var for var in required if not os.environ.get(var)]


def can_run_test(test_name: str) -> tuple[bool, list[str]]:
    """Check if a test can be run."""
    missing = check_test_env(test_name)
    return len(missing) == 0, missing


def run_test(test_name: str) -> bool:
    """Run a single test."""
    test_file = Path(__file__).parent / f"test_{test_name}.py"

    if not test_file.exists():
        print(f"  [SKIP] Test file not found: {test_file}")
        return False

    can_run, missing = can_run_test(test_name)
    if not can_run:
        print(f"  [SKIP] Missing env vars: {', '.join(missing)}")
        return False

    try:
        spec = importlib.util.spec_from_file_location(f"test_{test_name}", test_file)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # Find and run the test function
        test_func = None
        for name in dir(module):
            if name.startswith("test_") and callable(getattr(module, name)):
                test_func = getattr(module, name)
                break

        if test_func:
            result = test_func()
            print(f"  [OK] Response: {result[:100]}..." if len(str(result)) > 100 else f"  [OK] Response: {result}")
            return True
        else:
            print(f"  [FAIL] No test function found")
            return False

    except Exception as e:
        print(f"  [FAIL] {type(e).__name__}: {e}")
        return False


def list_tests():
    """List all available tests."""
    print("\nAvailable tests:\n")
    print(f"{'Test':<15} {'Required Env Vars':<50} {'Status'}")
    print("-" * 80)

    for test_name, required_vars in TESTS.items():
        can_run, missing = can_run_test(test_name)
        status = "[READY]" if can_run else f"[MISSING: {', '.join(missing)}]"
        vars_str = ", ".join(required_vars) if required_vars else "(none)"
        print(f"{test_name:<15} {vars_str:<50} {status}")


def main():
    if "--list" in sys.argv:
        list_tests()
        return

    # Check common env vars
    missing_common = check_common_env()
    if missing_common:
        print(f"Error: Missing required env vars: {', '.join(missing_common)}")
        print("\nSet these first:")
        print("  export LATITUDE_API_KEY='your-key'")
        print("  export LATITUDE_PROJECT_ID='your-project-id'")
        sys.exit(1)

    # Determine which tests to run
    if len(sys.argv) > 1:
        tests_to_run = [t for t in sys.argv[1:] if not t.startswith("-")]
    else:
        tests_to_run = list(TESTS.keys())

    print(f"\nRunning {len(tests_to_run)} test(s) against localhost:8787\n")

    passed = 0
    failed = 0
    skipped = 0

    for test_name in tests_to_run:
        if test_name not in TESTS:
            print(f"[{test_name}] Unknown test")
            continue

        print(f"[{test_name}]")
        can_run, _ = can_run_test(test_name)

        if can_run:
            if run_test(test_name):
                passed += 1
            else:
                failed += 1
        else:
            run_test(test_name)  # Will print skip message
            skipped += 1

    print(f"\n{'=' * 40}")
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")


if __name__ == "__main__":
    main()
