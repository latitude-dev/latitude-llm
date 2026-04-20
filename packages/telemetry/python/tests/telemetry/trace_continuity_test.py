"""Tests for trace continuity and span naming behavior."""

import pytest
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

from latitude_telemetry import capture, get_latitude_context
from latitude_telemetry.sdk.context import LATITUDE_CONTEXT_KEY, _LatitudeContextData


class TestTraceContinuity:
    """Tests for trace continuity - capture() creating parent spans."""

    @pytest.fixture(autouse=True)
    def setup_tracer_provider(self):
        """Set up a fresh tracer provider for each test."""
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
        yield provider
        # Clean up after test
        trace.set_tracer_provider(trace.NoOpTracerProvider())

    def test_capture_creates_parent_span_when_no_trace_exists(self):
        """Test that capture() creates a parent span when no active trace."""
        spans = []

        def my_function():
            # Get the current span
            current_span = trace.get_current_span()
            spans.append(
                {
                    "name": current_span.get_span_context().span_id,
                    "is_recording": current_span.is_recording(),
                }
            )

            # Create a child span
            tracer = trace.get_tracer("test.tracer")
            with tracer.start_as_current_span("child-span") as child:
                spans.append(
                    {
                        "child_name": child.get_span_context().span_id,
                        "child_parent": child.parent.span_id if child.parent else None,
                    }
                )

            return "done"

        capture("test-capture", my_function)

        # Verify we captured span info
        assert len(spans) >= 1
        # First span should be the capture parent span (recording)
        assert spans[0]["is_recording"] is True

    def test_capture_creates_new_root_trace_when_only_external_trace_exists(self):
        """Test that capture() starts a new root trace when the active trace is not Latitude-owned."""
        tracer = trace.get_tracer("test.tracer")

        with tracer.start_as_current_span("outer-manual-span") as outer:
            outer_trace_id = outer.get_span_context().trace_id

            captured_trace_id = []

            def my_function():
                current_span = trace.get_current_span()
                captured_trace_id.append(current_span.get_span_context().trace_id)
                return "done"

            capture("nested-capture", my_function)

            assert captured_trace_id[0] != outer_trace_id

    def test_capture_reuses_existing_latitude_trace(self):
        """Test that nested Latitude capture() calls stay inside the existing Latitude trace."""
        tracer = trace.get_tracer("test.tracer")

        with tracer.start_as_current_span("outer-manual-span") as outer:
            outer_trace_id = outer.get_span_context().trace_id
            latitude_context = otel_context.set_value(
                LATITUDE_CONTEXT_KEY,
                _LatitudeContextData(name="outer-capture", tags=["outer"], metadata={"foo": "bar"}),
                otel_context.get_current(),
            )

            captured_trace_id = []

            def my_function():
                current_span = trace.get_current_span()
                captured_trace_id.append(current_span.get_span_context().trace_id)
                return "done"

            token = otel_context.attach(latitude_context)
            try:
                capture("nested-capture", my_function, {"tags": ["inner"]})
            finally:
                otel_context.detach(token)

            assert captured_trace_id[0] == outer_trace_id

    def test_child_spans_share_trace_id(self):
        """Test that all child spans share the same trace ID."""
        trace_ids = []

        def my_function():
            tracer = trace.get_tracer("test.tracer")

            # Create multiple child spans
            with tracer.start_as_current_span("span-1"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            with tracer.start_as_current_span("span-2"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            with tracer.start_as_current_span("span-3"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            return "done"

        capture("parent-capture", my_function)

        # All spans should have the same trace ID
        assert len(trace_ids) == 3
        assert trace_ids[0] == trace_ids[1] == trace_ids[2]

    def test_nested_captures_create_single_trace(self):
        """Test that nested captures create a single trace, not multiple."""
        trace_ids = []

        def inner_function():
            current_span = trace.get_current_span()
            trace_ids.append(current_span.get_span_context().trace_id)
            return "inner"

        def outer_function():
            current_span = trace.get_current_span()
            trace_ids.append(current_span.get_span_context().trace_id)
            capture("inner", inner_function)
            return "outer"

        capture("outer", outer_function)

        # Both captures should be in the same trace
        assert len(trace_ids) == 2
        assert trace_ids[0] == trace_ids[1]


class TestSpanNaming:
    """Tests for span naming - only capture root renamed."""

    @pytest.fixture(autouse=True)
    def setup_tracer_provider(self):
        """Set up a fresh tracer provider for each test."""
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
        yield provider
        trace.set_tracer_provider(trace.NoOpTracerProvider())

    def test_capture_root_span_gets_renamed(self):
        """Test that the capture root span gets the capture name."""
        span_info = []

        def my_function():
            current_span = trace.get_current_span()
            # Check the latitude context for the expected name
            ctx = get_latitude_context(otel_context.get_current())
            span_info.append(
                {
                    "has_root_attr": current_span.attributes.get("latitude.capture.root")
                    if current_span.attributes
                    else False,
                    "context_name": ctx.name if ctx else None,
                }
            )
            return "done"

        capture("my-capture-name", my_function)

        # The context should have the capture name
        assert len(span_info) == 1
        assert span_info[0]["context_name"] == "my-capture-name"

    def test_child_spans_keep_original_names(self):
        """Test that child spans keep their original names."""
        span_names = []

        def my_function():
            tracer = trace.get_tracer("test.tracer")

            # Create child spans with specific names
            with tracer.start_as_current_span("database.query"):
                span_names.append(trace.get_current_span().name)

            with tracer.start_as_current_span("business.validate"):
                span_names.append(trace.get_current_span().name)

            with tracer.start_as_current_span("llm.call"):
                span_names.append(trace.get_current_span().name)

            return "done"

        capture("parent-capture", my_function)

        # Child spans should keep their original names
        assert "database.query" in span_names
        assert "business.validate" in span_names
        assert "llm.call" in span_names

    def test_grandchild_spans_keep_names(self):
        """Test that deeply nested spans keep their original names."""
        span_names = []

        def my_function():
            tracer = trace.get_tracer("test.tracer")

            with tracer.start_as_current_span("parent-operation"):
                span_names.append(trace.get_current_span().name)

                with tracer.start_as_current_span("child-operation"):
                    span_names.append(trace.get_current_span().name)

                    with tracer.start_as_current_span("grandchild-operation"):
                        span_names.append(trace.get_current_span().name)

            return "done"

        capture("root-capture", my_function)

        # All nested spans should keep their names
        assert "parent-operation" in span_names
        assert "child-operation" in span_names
        assert "grandchild-operation" in span_names

    def test_options_name_used_for_root(self):
        """Test that options.name is used for root span context if provided."""
        context_names = []

        def my_function():
            ctx = get_latitude_context(otel_context.get_current())
            context_names.append(ctx.name if ctx else None)
            return "done"

        capture("capture-name", my_function, {"name": "options-name", "tags": ["test"]})

        # Should use options.name in context
        assert context_names[0] == "options-name"


class TestSmartFilterCompatibility:
    """Tests for smart filter - latitude.* attributes pass filter."""

    @pytest.fixture(autouse=True)
    def setup_tracer_provider(self):
        """Set up a fresh tracer provider for each test."""
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
        yield provider
        trace.set_tracer_provider(trace.NoOpTracerProvider())

    def test_latitude_context_available_in_function(self):
        """Test that latitude context is available during function execution."""
        from latitude_telemetry.telemetry.span_filter import is_gen_ai_or_llm_attribute_span

        context_data = []

        def my_function():
            ctx = get_latitude_context(otel_context.get_current())
            context_data.append(
                {
                    "name": ctx.name if ctx else None,
                    "tags": ctx.tags if ctx else None,
                    "has_latitude_data": ctx is not None,
                }
            )
            return "done"

        capture("filter-test", my_function, {"tags": ["test"], "metadata": {"key": "value"}})

        # Verify context was available
        assert len(context_data) == 1
        assert context_data[0]["has_latitude_data"] is True
        assert context_data[0]["name"] == "filter-test"
        assert "test" in context_data[0]["tags"]


class TestAsyncTraceContinuity:
    """Tests for trace continuity with async functions."""

    @pytest.fixture(autouse=True)
    def setup_tracer_provider(self):
        """Set up a fresh tracer provider for each test."""
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
        yield provider
        trace.set_tracer_provider(trace.NoOpTracerProvider())

    @pytest.mark.asyncio
    async def test_async_capture_creates_parent_span(self):
        """Test that async capture() creates a parent span."""
        trace_ids = []

        async def my_async_function():
            tracer = trace.get_tracer("test.tracer")

            # Create child spans
            with tracer.start_as_current_span("async-span-1"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            with tracer.start_as_current_span("async-span-2"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            return "done"

        await capture("async-test", my_async_function)

        # All spans should share the same trace
        assert len(trace_ids) == 2
        assert trace_ids[0] == trace_ids[1]

    @pytest.mark.asyncio
    async def test_async_nested_captures_single_trace(self):
        """Test that nested async captures share a trace."""
        trace_ids = []

        async def inner_async():
            current_span = trace.get_current_span()
            trace_ids.append(current_span.get_span_context().trace_id)
            return "inner"

        async def outer_async():
            current_span = trace.get_current_span()
            trace_ids.append(current_span.get_span_context().trace_id)
            await capture("inner-async", inner_async)
            return "outer"

        await capture("outer-async", outer_async)

        # Both should be in same trace
        assert len(trace_ids) == 2
        assert trace_ids[0] == trace_ids[1]


class TestDecoratorMode:
    """Tests for @capture decorator mode with trace continuity."""

    @pytest.fixture(autouse=True)
    def setup_tracer_provider(self):
        """Set up a fresh tracer provider for each test."""
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
        yield provider
        trace.set_tracer_provider(trace.NoOpTracerProvider())

    def test_decorator_creates_parent_span(self):
        """Test that @capture decorator creates parent span."""
        trace_ids = []

        @capture("decorated-function", {"tags": ["decorator-test"]})
        def my_decorated_function():
            tracer = trace.get_tracer("test.tracer")

            with tracer.start_as_current_span("child-of-decorated"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            return "done"

        my_decorated_function()

        # Should have a trace ID
        assert len(trace_ids) == 1
        assert trace_ids[0] is not None

    def test_decorator_child_spans_keep_names(self):
        """Test that child spans in decorator mode keep names."""
        span_names = []

        @capture("decorated-parent")
        def my_decorated_function():
            tracer = trace.get_tracer("test.tracer")

            with tracer.start_as_current_span("custom.operation"):
                span_names.append(trace.get_current_span().name)

            return "done"

        my_decorated_function()

        assert span_names[0] == "custom.operation"

    @pytest.mark.asyncio
    async def test_async_decorator_creates_parent_span(self):
        """Test that async @capture creates parent span."""
        trace_ids = []

        @capture("async-decorated", {"tags": ["async-decorator"]})
        async def my_async_decorated():
            tracer = trace.get_tracer("test.tracer")

            with tracer.start_as_current_span("async-child"):
                trace_ids.append(trace.get_current_span().get_span_context().trace_id)

            return "done"

        await my_async_decorated()

        assert len(trace_ids) == 1
        assert trace_ids[0] is not None
