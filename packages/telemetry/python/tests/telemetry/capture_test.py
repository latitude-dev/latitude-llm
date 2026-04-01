"""Tests for the capture decorator and context manager patterns."""

import json

import pytest
from unittest.mock import patch, MagicMock

from latitude_telemetry import Telemetry, TelemetryOptions, CaptureContext
from latitude_telemetry.constants import ATTRIBUTES


class TestCaptureDecorator:
    """Tests for the capture decorator pattern."""

    @pytest.fixture
    def telemetry(self):
        """Create a telemetry instance with mocked exporter."""
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", "test-project", TelemetryOptions(disable_batch=True))
            yield t
            t.shutdown()

    def test_decorator_sync_function(self, telemetry):
        """Test capture as a decorator on a sync function."""

        @telemetry.capture(tags=["test"], user_id="user-1")
        def my_function():
            return "result"

        result = my_function()
        assert result == "result"

    @pytest.mark.asyncio
    async def test_decorator_async_function(self, telemetry):
        """Test capture as a decorator on an async function."""

        @telemetry.capture(session_id="sess-1")
        async def my_async_function():
            return "async result"

        result = await my_async_function()
        assert result == "async result"

    def test_decorator_preserves_exception(self, telemetry):
        """Test that capture re-raises exceptions."""

        @telemetry.capture(tags=["error-test"])
        def failing_function():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            failing_function()


class TestCaptureContextManager:
    """Tests for the capture context manager pattern."""

    @pytest.fixture
    def telemetry(self):
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", "test-project", TelemetryOptions(disable_batch=True))
            yield t
            t.shutdown()

    def test_sync_context_manager(self, telemetry):
        """Test capture as a sync context manager."""
        with telemetry.capture(metadata={"key": "value"}):
            result = 42

        assert result == 42

    @pytest.mark.asyncio
    async def test_async_context_manager(self, telemetry):
        """Test capture as an async context manager."""
        async with telemetry.capture(user_id="user-2"):
            result = 42

        assert result == 42


class TestCaptureOptions:
    """Tests for capture option handling."""

    @pytest.fixture
    def telemetry(self):
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", "test-project", TelemetryOptions(disable_batch=True))
            yield t
            t.shutdown()

    def test_capture_returns_capture_context(self, telemetry):
        """Test that capture() returns a CaptureContext."""
        ctx = telemetry.capture(tags=["a", "b"])
        assert isinstance(ctx, CaptureContext)

    def test_capture_all_options(self, telemetry):
        """Test capture with all options set."""

        @telemetry.capture(
            tags=["prod", "v2"],
            metadata={"env": "production"},
            session_id="sess-abc",
            user_id="user-xyz",
        )
        def my_function():
            return "ok"

        result = my_function()
        assert result == "ok"

    def test_capture_no_options(self, telemetry):
        """Test capture with no options."""

        @telemetry.capture()
        def my_function():
            return "ok"

        result = my_function()
        assert result == "ok"
