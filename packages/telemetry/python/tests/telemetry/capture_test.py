"""Tests for the capture() function and context propagation."""

import pytest
from opentelemetry import context as otel_context

from latitude_telemetry import capture, get_latitude_context


class TestCaptureFunction:
    """Tests for the capture() function."""

    def test_capture_sync_function(self):
        """Test capture() wrapping a sync function."""

        def my_function():
            # Verify context is set inside the function
            ctx = get_latitude_context(otel_context.get_current())
            assert ctx is not None
            assert ctx.name == "test-capture"
            assert ctx.tags == ["test"]
            assert ctx.user_id == "user-1"
            return "result"

        result = capture("test-capture", my_function, {"tags": ["test"], "user_id": "user-1"})
        assert result == "result"

    @pytest.mark.asyncio
    async def test_capture_async_function(self):
        """Test capture() wrapping an async function."""

        async def my_async_function():
            ctx = get_latitude_context(otel_context.get_current())
            assert ctx is not None
            assert ctx.name == "async-capture"
            assert ctx.session_id == "sess-1"
            return "async result"

        result = await capture("async-capture", my_async_function, {"session_id": "sess-1"})
        assert result == "async result"

    def test_capture_preserves_exception(self):
        """Test that capture() re-raises exceptions."""

        def failing_function():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            capture("error-test", failing_function, {"tags": ["error-test"]})


class TestCaptureContextPropagation:
    """Tests for context propagation within capture()."""

    def test_context_is_set_during_execution(self):
        """Test that Latitude context is accessible during function execution."""
        captured_ctx = None

        def my_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "done"

        capture("ctx-test", my_function, {"tags": ["a", "b"], "metadata": {"key": "value"}})

        assert captured_ctx is not None
        assert captured_ctx.name == "ctx-test"
        assert captured_ctx.tags == ["a", "b"]
        assert captured_ctx.metadata == {"key": "value"}

    def test_context_is_restored_after_execution(self):
        """Test that context is restored after capture() completes."""
        # Set some initial context
        initial_ctx = otel_context.set_value("test-key", "test-value", otel_context.get_current())
        token = otel_context.attach(initial_ctx)

        try:

            def my_function():
                # Inside function, Latitude context should be present
                lat_ctx = get_latitude_context(otel_context.get_current())
                assert lat_ctx is not None
                # Original context key should still be present
                assert otel_context.get_current().get("test-key") == "test-value"
                return "done"

            capture("restore-test", my_function, {"user_id": "user-1"})

            # After capture, the context should still have our original key
            assert otel_context.get_current().get("test-key") == "test-value"
        finally:
            otel_context.detach(token)


class TestCaptureMerging:
    """Tests for capture() context merging behavior."""

    def test_name_override_in_options(self):
        """Test that options.name takes precedence over capture name."""
        captured_ctx = None

        def my_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "done"

        capture("capture-name", my_function, {"name": "options-name"})

        assert captured_ctx is not None
        assert captured_ctx.name == "options-name"

    def test_tags_merge_and_deduplicate(self):
        """Test that tags are merged and deduplicated."""
        captured_ctx = None

        def inner_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "done"

        def outer_function():
            return capture("inner", inner_function, {"tags": ["c", "a"]})

        capture("outer", outer_function, {"tags": ["a", "b"]})

        assert captured_ctx is not None
        # Order should be preserved: outer [a, b] + inner [c, a] = [a, b, c]
        assert captured_ctx.tags == ["a", "b", "c"]

    def test_metadata_shallow_merge(self):
        """Test that metadata uses shallow merge (child overrides parent)."""
        captured_ctx = None

        def inner_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "done"

        def outer_function():
            return capture("inner", inner_function, {"metadata": {"key2": "inner-value", "key3": "value3"}})

        capture("outer", outer_function, {"metadata": {"key1": "value1", "key2": "outer-value"}})

        assert captured_ctx is not None
        # Child should override parent for same keys
        assert captured_ctx.metadata == {
            "key1": "value1",
            "key2": "inner-value",  # inner overrides outer
            "key3": "value3",
        }

    def test_session_id_last_write_wins(self):
        """Test that session_id uses last-write-wins (child overrides parent)."""
        captured_ctx = None

        def inner_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "done"

        def outer_function():
            return capture("inner", inner_function, {"session_id": "inner-session"})

        capture("outer", outer_function, {"session_id": "outer-session"})

        assert captured_ctx is not None
        assert captured_ctx.session_id == "inner-session"

    def test_user_id_last_write_wins(self):
        """Test that user_id uses last-write-wins (child overrides parent)."""
        captured_ctx = None

        def inner_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "done"

        def outer_function():
            return capture("inner", inner_function, {"user_id": "inner-user"})

        capture("outer", outer_function, {"user_id": "outer-user"})

        assert captured_ctx is not None
        assert captured_ctx.user_id == "inner-user"


class TestCaptureOptions:
    """Tests for capture option handling."""

    def test_capture_all_options(self):
        """Test capture with all options set."""
        captured_ctx = None

        def my_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "ok"

        capture(
            "full-options",
            my_function,
            {
                "tags": ["prod", "v2"],
                "metadata": {"env": "production"},
                "session_id": "sess-abc",
                "user_id": "user-xyz",
            },
        )

        assert captured_ctx is not None
        assert captured_ctx.name == "full-options"
        assert captured_ctx.tags == ["prod", "v2"]
        assert captured_ctx.metadata == {"env": "production"}
        assert captured_ctx.session_id == "sess-abc"
        assert captured_ctx.user_id == "user-xyz"

    def test_capture_no_options(self):
        """Test capture with no options (just name and fn)."""
        captured_ctx = None

        def my_function():
            nonlocal captured_ctx
            captured_ctx = get_latitude_context(otel_context.get_current())
            return "ok"

        capture("no-options", my_function)

        assert captured_ctx is not None
        assert captured_ctx.name == "no-options"
        assert captured_ctx.tags is None
        assert captured_ctx.metadata == {}
        assert captured_ctx.session_id is None
        assert captured_ctx.user_id is None
