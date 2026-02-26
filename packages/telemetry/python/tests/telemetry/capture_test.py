"""Tests for the capture decorator and context manager patterns."""

import pytest
from unittest.mock import patch, MagicMock
from typing import Generator, AsyncGenerator

from latitude_telemetry import Telemetry, TelemetryOptions, BadRequestError, CaptureContext
from latitude_telemetry.constants import ATTRIBUTES


class TestCaptureDecorator:
    """Tests for the capture decorator pattern."""

    @pytest.fixture
    def telemetry(self):
        """Create a telemetry instance with mocked exporter."""
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", TelemetryOptions(disable_batch=True))
            # Mock the manual instrumentation
            t._manual_instrumentation = MagicMock()
            mock_span = MagicMock()
            mock_span.context = MagicMock()
            t._manual_instrumentation.capture_external.return_value = mock_span
            return t

    def test_capture_returns_capture_context(self, telemetry):
        """Test that capture returns a CaptureContext."""
        ctx = telemetry.capture(path="test-path", project_id=123)
        assert isinstance(ctx, CaptureContext)

    def test_decorator_sync_function(self, telemetry):
        """Test decorator with a sync function."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_function(x: int) -> int:
            return x * 2

        result = my_function(5)
        assert result == 10
        telemetry._manual_instrumentation.capture_external.assert_called_once()

    def test_capture_populates_baggage_for_child_spans(self, telemetry):
        """Test capture sets reference attributes in baggage."""

        with patch("latitude_telemetry.telemetry.telemetry.set_baggage") as set_baggage_mock:
            set_baggage_mock.side_effect = lambda key, value, context: context

            @telemetry.capture(
                path="test-path",
                project_id=123,
                version_uuid="commit-uuid",
                conversation_uuid="conversation-uuid",
            )
            def my_function(x: int) -> int:
                return x * 2

            result = my_function(5)

            assert result == 10
            assert set_baggage_mock.call_count == 4
            calls = [call.args[:2] for call in set_baggage_mock.call_args_list]
            assert (ATTRIBUTES.LATITUDE.promptPath, "test-path") in calls
            assert (ATTRIBUTES.LATITUDE.projectId, "123") in calls
            assert (ATTRIBUTES.LATITUDE.commitUuid, "commit-uuid") in calls
            assert (ATTRIBUTES.LATITUDE.documentLogUuid, "conversation-uuid") in calls

    def test_decorator_sync_function_with_exception(self, telemetry):
        """Test decorator handles exceptions in sync functions."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_function():
            raise ValueError("Test error")

        with pytest.raises(ValueError, match="Test error"):
            my_function()

        # Span should have fail called
        span = telemetry._manual_instrumentation.capture_external.return_value
        span.fail.assert_called_once()

    @pytest.mark.asyncio
    async def test_decorator_async_function(self, telemetry):
        """Test decorator with an async function."""

        @telemetry.capture(path="test-path", project_id=123)
        async def my_async_function(x: int) -> int:
            return x * 2

        result = await my_async_function(5)
        assert result == 10
        telemetry._manual_instrumentation.capture_external.assert_called_once()

    @pytest.mark.asyncio
    async def test_decorator_async_function_with_exception(self, telemetry):
        """Test decorator handles exceptions in async functions."""

        @telemetry.capture(path="test-path", project_id=123)
        async def my_async_function():
            raise ValueError("Test error")

        with pytest.raises(ValueError, match="Test error"):
            await my_async_function()

        # Span should have fail called
        span = telemetry._manual_instrumentation.capture_external.return_value
        span.fail.assert_called_once()

    def test_decorator_preserves_function_metadata(self, telemetry):
        """Test that the decorator preserves function name and docstring."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_documented_function():
            """This is my docstring."""
            pass

        assert my_documented_function.__name__ == "my_documented_function"
        assert my_documented_function.__doc__ == "This is my docstring."


class TestCaptureContextManager:
    """Tests for the capture context manager pattern."""

    @pytest.fixture
    def telemetry(self):
        """Create a telemetry instance with mocked exporter."""
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", TelemetryOptions(disable_batch=True))
            # Mock the manual instrumentation
            t._manual_instrumentation = MagicMock()
            mock_span = MagicMock()
            mock_span.context = MagicMock()
            t._manual_instrumentation.capture_external.return_value = mock_span
            return t

    def test_context_manager_sync(self, telemetry):
        """Test using capture as a sync context manager."""
        result = None
        with telemetry.capture(path="test-path", project_id=123):
            result = 42

        assert result == 42
        telemetry._manual_instrumentation.capture_external.assert_called_once()
        span = telemetry._manual_instrumentation.capture_external.return_value
        span.end.assert_called_once()

    def test_context_manager_sync_with_exception(self, telemetry):
        """Test context manager handles exceptions."""
        with pytest.raises(ValueError, match="Test error"):
            with telemetry.capture(path="test-path", project_id=123):
                raise ValueError("Test error")

        span = telemetry._manual_instrumentation.capture_external.return_value
        span.fail.assert_called_once()

    @pytest.mark.asyncio
    async def test_context_manager_async(self, telemetry):
        """Test using capture as an async context manager."""
        result = None
        async with telemetry.capture(path="test-path", project_id=123):
            result = 42

        assert result == 42
        telemetry._manual_instrumentation.capture_external.assert_called_once()
        span = telemetry._manual_instrumentation.capture_external.return_value
        span.end.assert_called_once()

    @pytest.mark.asyncio
    async def test_context_manager_async_with_exception(self, telemetry):
        """Test async context manager handles exceptions."""
        with pytest.raises(ValueError, match="Test error"):
            async with telemetry.capture(path="test-path", project_id=123):
                raise ValueError("Test error")

        span = telemetry._manual_instrumentation.capture_external.return_value
        span.fail.assert_called_once()


class TestCaptureValidation:
    """Tests for capture path validation."""

    @pytest.fixture
    def telemetry(self):
        """Create a telemetry instance with mocked exporter."""
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", TelemetryOptions(disable_batch=True))
            return t

    def test_valid_path_with_letters(self, telemetry):
        """Test valid path with letters."""
        ctx = telemetry.capture(path="my-feature", project_id=123)
        # Should not raise when used
        ctx._validate_path()

    def test_valid_path_with_numbers(self, telemetry):
        """Test valid path with numbers."""
        ctx = telemetry.capture(path="feature123", project_id=123)
        ctx._validate_path()

    def test_valid_path_with_slashes(self, telemetry):
        """Test valid path with slashes."""
        ctx = telemetry.capture(path="my/nested/feature", project_id=123)
        ctx._validate_path()

    def test_valid_path_with_dots(self, telemetry):
        """Test valid path with dots."""
        ctx = telemetry.capture(path="my.feature.name", project_id=123)
        ctx._validate_path()

    def test_valid_path_with_underscores(self, telemetry):
        """Test valid path with underscores."""
        ctx = telemetry.capture(path="my_feature_name", project_id=123)
        ctx._validate_path()

    def test_invalid_path_with_spaces(self, telemetry):
        """Test invalid path with spaces."""
        ctx = telemetry.capture(path="my feature", project_id=123)
        with pytest.raises(BadRequestError):
            ctx._validate_path()

    def test_invalid_path_with_special_chars(self, telemetry):
        """Test invalid path with special characters."""
        ctx = telemetry.capture(path="my@feature!", project_id=123)
        with pytest.raises(BadRequestError):
            ctx._validate_path()


class TestCaptureGenerators:
    """Tests for the capture decorator with generator functions."""

    @pytest.fixture
    def telemetry(self):
        """Create a telemetry instance with mocked exporter."""
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", TelemetryOptions(disable_batch=True))
            t._manual_instrumentation = MagicMock()
            mock_span = MagicMock()
            mock_span.context = MagicMock()
            t._manual_instrumentation.capture_external.return_value = mock_span
            return t

    def test_decorator_sync_generator(self, telemetry):
        """Test decorator with a sync generator function."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_generator(items: list) -> Generator[str, None, None]:
            for item in items:
                yield item

        items = ["a", "b", "c"]
        result = list(my_generator(items))

        assert result == items
        telemetry._manual_instrumentation.capture_external.assert_called_once()
        span = telemetry._manual_instrumentation.capture_external.return_value
        span.end.assert_called_once()

    def test_decorator_sync_generator_keeps_span_open_during_iteration(self, telemetry):
        """Test that span stays open until generator is fully consumed."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_generator() -> Generator[int, None, None]:
            yield 1
            yield 2
            yield 3

        gen = my_generator()
        span = telemetry._manual_instrumentation.capture_external.return_value

        next(gen)
        span.end.assert_not_called()

        next(gen)
        span.end.assert_not_called()

        next(gen)
        span.end.assert_not_called()

        with pytest.raises(StopIteration):
            next(gen)

        span.end.assert_called_once()

    def test_decorator_sync_generator_with_exception(self, telemetry):
        """Test decorator handles exceptions in sync generators."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_generator() -> Generator[str, None, None]:
            yield "first"
            raise ValueError("Generator error")

        gen = my_generator()
        assert next(gen) == "first"

        with pytest.raises(ValueError, match="Generator error"):
            next(gen)

        span = telemetry._manual_instrumentation.capture_external.return_value
        span.fail.assert_called_once()

    def test_decorator_sync_generator_early_exit(self, telemetry):
        """Test that span ends when generator is abandoned early."""

        @telemetry.capture(path="test-path", project_id=123)
        def my_generator() -> Generator[int, None, None]:
            yield 1
            yield 2
            yield 3

        gen = my_generator()
        next(gen)

        span = telemetry._manual_instrumentation.capture_external.return_value
        span.end.assert_not_called()

        gen.close()
        span.end.assert_called_once()

    @pytest.mark.asyncio
    async def test_decorator_async_generator(self, telemetry):
        """Test decorator with an async generator function."""

        @telemetry.capture(path="test-path", project_id=123)
        async def my_async_generator(items: list) -> AsyncGenerator[str, None]:
            for item in items:
                yield item

        items = ["a", "b", "c"]
        result = [item async for item in my_async_generator(items)]

        assert result == items
        telemetry._manual_instrumentation.capture_external.assert_called_once()
        span = telemetry._manual_instrumentation.capture_external.return_value
        span.end.assert_called_once()

    @pytest.mark.asyncio
    async def test_decorator_async_generator_keeps_span_open_during_iteration(self, telemetry):
        """Test that span stays open until async generator is fully consumed."""

        @telemetry.capture(path="test-path", project_id=123)
        async def my_async_generator() -> AsyncGenerator[int, None]:
            yield 1
            yield 2
            yield 3

        gen = my_async_generator()
        span = telemetry._manual_instrumentation.capture_external.return_value

        await gen.__anext__()
        span.end.assert_not_called()

        await gen.__anext__()
        span.end.assert_not_called()

        await gen.__anext__()
        span.end.assert_not_called()

        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()

        span.end.assert_called_once()

    @pytest.mark.asyncio
    async def test_decorator_async_generator_with_exception(self, telemetry):
        """Test decorator handles exceptions in async generators."""

        @telemetry.capture(path="test-path", project_id=123)
        async def my_async_generator() -> AsyncGenerator[str, None]:
            yield "first"
            raise ValueError("Async generator error")

        gen = my_async_generator()
        assert await gen.__anext__() == "first"

        with pytest.raises(ValueError, match="Async generator error"):
            await gen.__anext__()

        span = telemetry._manual_instrumentation.capture_external.return_value
        span.fail.assert_called_once()

    @pytest.mark.asyncio
    async def test_decorator_async_generator_early_exit(self, telemetry):
        """Test that span ends when async generator is abandoned early."""

        @telemetry.capture(path="test-path", project_id=123)
        async def my_async_generator() -> AsyncGenerator[int, None]:
            yield 1
            yield 2
            yield 3

        gen = my_async_generator()
        await gen.__anext__()

        span = telemetry._manual_instrumentation.capture_external.return_value
        span.end.assert_not_called()

        await gen.aclose()
        span.end.assert_called_once()
