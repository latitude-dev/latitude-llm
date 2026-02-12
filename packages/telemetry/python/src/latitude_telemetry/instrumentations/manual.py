"""
Manual instrumentation for creating custom spans.
Mirrors the TypeScript implementation.
"""

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, cast
from urllib.parse import unquote

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.baggage import set_baggage
from opentelemetry.context import Context
from opentelemetry.trace import Span, StatusCode, Tracer
from opentelemetry.trace import SpanKind as OtelSpanKind

from latitude_telemetry.constants import (
    ATTRIBUTES,
    HEAD_COMMIT,
    SPAN_SPECIFICATIONS,
    LogSources,
    SpanType,
)
from latitude_telemetry.instrumentations.base import BaseInstrumentation


@dataclass
class TraceContext:
    """Context for resuming a trace from external sources."""

    traceparent: str
    baggage: str | None = None


@dataclass
class StartSpanOptions:
    """Options for starting a span."""

    name: str | None = None
    attributes: Dict[str, Any] | None = None
    startTime: int | float | None = None


@dataclass
class EndSpanOptions:
    """Options for ending a span."""

    attributes: Dict[str, Any] | None = None
    endTime: int | float | None = None


@dataclass
class ErrorOptions:
    """Options for recording an error."""

    attributes: Dict[str, Any] | None = None


@dataclass
class ToolCallInfo:
    """Information about a tool call."""

    id: str
    arguments: Dict[str, Any]


@dataclass
class ToolResultInfo:
    """Information about a tool result."""

    value: Any
    isError: bool


@dataclass
class StartToolSpanOptions:
    """Options for starting a tool span."""

    name: str = ""
    call: ToolCallInfo | None = None
    attributes: Dict[str, Any] | None = None


@dataclass
class EndToolSpanOptions(EndSpanOptions):
    """Options for ending a tool span."""

    result: ToolResultInfo | None = None


@dataclass
class TokenUsage:
    """Token usage information."""

    prompt: int = 0
    cached: int = 0
    reasoning: int = 0
    completion: int = 0


@dataclass
class StartCompletionSpanOptions(StartSpanOptions):
    """Options for starting a completion span."""

    provider: str = ""
    model: str = ""
    configuration: Dict[str, Any] | None = None
    input: List[Dict[str, Any]] | None = None
    versionUuid: str | None = None
    promptUuid: str | None = None
    experimentUuid: str | None = None


@dataclass
class EndCompletionSpanOptions(EndSpanOptions):
    """Options for ending a completion span."""

    output: List[Dict[str, Any]] | None = None
    tokens: TokenUsage | None = None
    finishReason: str | None = None


@dataclass
class HttpRequest:
    """HTTP request information."""

    method: str
    url: str
    headers: Dict[str, str]
    body: str | Dict[str, Any]


@dataclass
class HttpResponse:
    """HTTP response information."""

    status: int
    headers: Dict[str, str]
    body: str | Dict[str, Any]


@dataclass
class StartHttpSpanOptions(StartSpanOptions):
    """Options for starting an HTTP span."""

    request: HttpRequest | None = None


@dataclass
class EndHttpSpanOptions(EndSpanOptions):
    """Options for ending an HTTP span."""

    response: HttpResponse | None = None


@dataclass
class PromptSpanOptions(StartSpanOptions):
    """Options for a prompt span."""

    documentLogUuid: str = ""
    versionUuid: str | None = None
    promptUuid: str = ""
    projectId: int | None = None
    experimentUuid: str | None = None
    testDeploymentId: int | None = None
    externalId: str | None = None
    template: str = ""
    parameters: Dict[str, Any] | None = None
    source: LogSources | None = None


@dataclass
class ChatSpanOptions(StartSpanOptions):
    """Options for a chat span."""

    documentLogUuid: str = ""
    source: LogSources | None = None


@dataclass
class ExternalSpanOptions(StartSpanOptions):
    """Options for an external span."""

    promptUuid: str = ""
    documentLogUuid: str = ""
    source: LogSources | None = None
    versionUuid: str | None = None
    externalId: str | None = None


@dataclass
class CaptureOptions(StartSpanOptions):
    """Options for capture method."""

    path: str = ""
    projectId: int = 0
    versionUuid: str | None = None
    conversationUuid: str | None = None


@dataclass
class SpanHandle:
    """Handle for controlling a span."""

    context: Context
    end: Callable[[EndSpanOptions | None], None]
    fail: Callable[[Exception, ErrorOptions | None], None]


@dataclass
class ToolSpanHandle:
    """Handle for controlling a tool span."""

    context: Context
    end: Callable[[EndToolSpanOptions], None]
    fail: Callable[[Exception, ErrorOptions | None], None]


@dataclass
class CompletionSpanHandle:
    """Handle for controlling a completion span."""

    context: Context
    end: Callable[[EndCompletionSpanOptions | None], None]
    fail: Callable[[Exception, ErrorOptions | None], None]


@dataclass
class HttpSpanHandle:
    """Handle for controlling an HTTP span."""

    context: Context
    end: Callable[[EndHttpSpanOptions], None]
    fail: Callable[[Exception, ErrorOptions | None], None]


class ManualInstrumentation(BaseInstrumentation):
    """
    Manual instrumentation for creating custom telemetry spans.
    Mirrors the TypeScript ManualInstrumentation class.
    """

    def __init__(self, tracer: Tracer):
        self._enabled = False
        self._tracer = tracer

    def is_enabled(self) -> bool:
        return self._enabled

    def enable(self) -> None:
        self._enabled = True

    def disable(self) -> None:
        self._enabled = False

    def resume(self, ctx: TraceContext) -> Context:
        """Resume a trace from a TraceContext (traceparent + baggage)."""
        parts = ctx.traceparent.split("-")
        if len(parts) != 4:
            return otel_context.get_current()

        _, trace_id, span_id, flags = parts
        if not trace_id or not span_id:
            return otel_context.get_current()

        span_context = trace.SpanContext(
            trace_id=int(trace_id, 16),
            span_id=int(span_id, 16),
            is_remote=True,
            trace_flags=trace.TraceFlags(int(flags, 16)),
        )

        context = trace.set_span_in_context(trace.NonRecordingSpan(span_context), otel_context.get_current())

        if ctx.baggage:
            for pair in ctx.baggage.split(","):
                if "=" in pair:
                    key, value = pair.split("=", 1)
                    if key and value:
                        context = set_baggage(key, unquote(value), context)

        return context

    def _capitalize(self, s: str) -> str:
        if not s:
            return s
        return s[0].upper() + s[1:].lower()

    def _to_camel_case(self, s: str) -> str:
        # Split on non-alphanumeric and camelCase boundaries
        s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
        s = re.sub(r"[^A-Za-z0-9]+", " ", s)
        parts = s.strip().split()
        if not parts:
            return ""
        return parts[0].lower() + "".join(self._capitalize(p) for p in parts[1:])

    def _to_snake_case(self, s: str) -> str:
        s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
        s = re.sub(r"[^A-Za-z0-9]+", "_", s)
        s = re.sub(r"_+", "_", s)
        s = s.strip("_")
        return s.lower()

    def _to_kebab_case(self, s: str) -> str:
        s = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s)
        s = re.sub(r"[^A-Za-z0-9]+", "-", s)
        s = re.sub(r"-+", "-", s)
        s = s.strip("-")
        return s.lower()

    def _safe_json(self, value: Any, default: str = "{}") -> str:
        try:
            return json.dumps(value)
        except (TypeError, ValueError):
            return default

    def _error(self, span: Span, error: Exception, options: ErrorOptions | None = None) -> None:
        options = options or ErrorOptions()
        span.record_exception(error)
        if options.attributes:
            span.set_attributes(options.attributes)
        span.set_status(StatusCode.ERROR, str(error))
        span.end()

    def _span(
        self,
        ctx: Context,
        name: str,
        span_type: SpanType,
        options: StartSpanOptions | None = None,
    ) -> SpanHandle:
        """Create a generic span with the given type."""
        if not self._enabled:
            # Return a no-op handle
            return SpanHandle(
                context=ctx,
                end=lambda _: None,
                fail=lambda e, o: None,
            )

        start = options or StartSpanOptions()

        operation = None
        if SPAN_SPECIFICATIONS[span_type].isGenAI:
            operation = span_type.value

        attributes: Dict[str, Any] = {
            ATTRIBUTES.LATITUDE.type: span_type.value,
        }
        if operation:
            attributes[ATTRIBUTES.OPENTELEMETRY.GEN_AI.operation] = operation
        if start.attributes:
            attributes.update(start.attributes)

        span = self._tracer.start_span(
            name,
            context=ctx,
            kind=OtelSpanKind.CLIENT,
            attributes=attributes,
            start_time=int(start.startTime * 1e9) if start.startTime else None,
        )

        new_ctx = trace.set_span_in_context(span, ctx)

        def end_span(end_options: EndSpanOptions | None = None) -> None:
            end_opts = end_options or EndSpanOptions()
            if end_opts.attributes:
                span.set_attributes(end_opts.attributes)
            span.set_status(StatusCode.OK)
            end_time_ns = int(end_opts.endTime * 1e9) if end_opts.endTime else None
            span.end(end_time=end_time_ns)

        def fail_span(error: Exception, err_options: ErrorOptions | None = None) -> None:
            self._error(span, error, err_options)

        return SpanHandle(context=new_ctx, end=end_span, fail=fail_span)

    def tool(self, ctx: Context, options: StartToolSpanOptions) -> ToolSpanHandle:
        """Create a tool execution span."""
        json_arguments = self._safe_json(options.call.arguments if options.call else {})

        attributes: Dict[str, Any] = {
            ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.name: options.name,
            ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.type: "function",
        }
        if options.call:
            attributes[ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.id] = options.call.id
            attributes[ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.arguments] = json_arguments
        if options.attributes:
            attributes.update(options.attributes)

        span_handle = self._span(
            ctx,
            options.name,
            SpanType.Tool,
            StartSpanOptions(attributes=attributes),
        )

        def end_tool(end_options: EndToolSpanOptions) -> None:
            result_value = ""
            if end_options.result:
                if isinstance(end_options.result.value, str):
                    result_value = end_options.result.value
                else:
                    result_value = self._safe_json(end_options.result.value)

            end_attrs: Dict[str, Any] = {}
            if end_options.result:
                end_attrs[ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.result.value] = result_value
                end_attrs[ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.result.isError] = end_options.result.isError
            if end_options.attributes:
                end_attrs.update(end_options.attributes)

            span_handle.end(EndSpanOptions(attributes=end_attrs, endTime=end_options.endTime))

        return ToolSpanHandle(
            context=span_handle.context,
            end=end_tool,
            fail=span_handle.fail,
        )

    def _attribify_message_tool_calls(
        self, prefix: str, index: int, tool_calls: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Convert tool calls to span attributes."""
        attributes: Dict[str, Any] = {}

        for i, tool_call in enumerate(tool_calls):
            for key, value in tool_call.items():
                field_name = self._to_camel_case(key)
                if value is None:
                    continue

                base = f"{prefix}.{index}.tool_calls.{i}"

                if field_name in ("id", "toolCallId", "toolUseId"):
                    if isinstance(value, str):
                        attributes[f"{base}.id"] = value

                elif field_name in ("name", "toolName"):
                    if isinstance(value, str):
                        attributes[f"{base}.name"] = value

                elif field_name in ("arguments", "toolArguments", "input"):
                    if isinstance(value, str):
                        attributes[f"{base}.arguments"] = value
                    else:
                        attributes[f"{base}.arguments"] = self._safe_json(value)

                elif field_name == "function":
                    if isinstance(value, dict):
                        if "name" in value and isinstance(value["name"], str):
                            attributes[f"{base}.name"] = value["name"]
                        if "arguments" in value and isinstance(value["arguments"], str):
                            attributes[f"{base}.arguments"] = value["arguments"]

        return attributes

    def _attribify_message_content(self, prefix: str, index: int, content: Any) -> Dict[str, Any]:
        """Convert message content to span attributes."""
        attributes: Dict[str, Any] = {}
        content_key = f"{prefix}.{index}.content"

        if isinstance(content, str):
            attributes[content_key] = content
            return attributes

        attributes[content_key] = self._safe_json(content, "[]")

        if not isinstance(content, list):
            return attributes

        content_list = cast(List[Any], content)
        tool_calls: List[Dict[str, Any]] = []
        for item in content_list:
            if not isinstance(item, dict):
                continue
            item_dict = cast(Dict[str, Any], item)
            for key, value in item_dict.items():
                if self._to_camel_case(key) == "type":
                    if isinstance(value, str) and value in ("tool-call", "tool_use"):
                        tool_calls.append(item_dict)
                        break

        if tool_calls:
            attributes.update(self._attribify_message_tool_calls(prefix, index, tool_calls))

        return attributes

    def _attribify_messages(self, direction: str, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert messages to span attributes."""
        prefix = "gen_ai.prompt" if direction == "input" else "gen_ai.completion"

        attributes: Dict[str, Any] = {}

        for i, message in enumerate(messages):
            for key, value in message.items():
                field_name = self._to_camel_case(key)
                if value is None:
                    continue

                if field_name == "role":
                    if isinstance(value, str):
                        attributes[f"{prefix}.{i}.role"] = value

                elif field_name == "content":
                    attributes.update(self._attribify_message_content(prefix, i, value))

                elif field_name == "toolCalls":
                    if isinstance(value, list):
                        value_list = cast(List[Any], value)
                        tool_calls_list: List[Dict[str, Any]] = [tc for tc in value_list if isinstance(tc, dict)]
                        attributes.update(self._attribify_message_tool_calls(prefix, i, tool_calls_list))

                elif field_name in ("toolCallId", "toolId", "toolUseId"):
                    if isinstance(value, str):
                        attributes[f"{prefix}.{i}.tool_call_id"] = value

                elif field_name == "toolName":
                    if isinstance(value, str):
                        attributes[f"{prefix}.{i}.tool_name"] = value

                elif field_name == "isError":
                    if isinstance(value, bool):
                        attributes[f"{prefix}.{i}.is_error"] = value

        return attributes

    def _attribify_configuration(self, direction: str, configuration: Dict[str, Any]) -> Dict[str, Any]:
        """Convert configuration to span attributes."""
        prefix = "gen_ai.request" if direction == "input" else "gen_ai.response"

        attributes: Dict[str, Any] = {}
        for key, value in configuration.items():
            field_name = self._to_snake_case(key)
            if value is None:
                continue

            if isinstance(value, dict):
                value = self._safe_json(value)

            attributes[f"{prefix}.{field_name}"] = value

        return attributes

    def completion(self, ctx: Context, options: StartCompletionSpanOptions) -> CompletionSpanHandle:
        """Create a completion span."""
        configuration = {**(options.configuration or {}), "model": options.model}
        json_configuration = self._safe_json(configuration)
        attr_configuration = self._attribify_configuration("input", configuration)

        input_messages = options.input or []
        json_input = self._safe_json(input_messages, "[]")
        attr_input = self._attribify_messages("input", input_messages)

        attributes: Dict[str, Any] = {
            ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system: options.provider,
            ATTRIBUTES.LATITUDE.request.configuration: json_configuration,
            **attr_configuration,
            ATTRIBUTES.LATITUDE.request.messages: json_input,
            **attr_input,
        }
        if options.versionUuid:
            attributes[ATTRIBUTES.LATITUDE.commitUuid] = options.versionUuid
        if options.promptUuid:
            attributes[ATTRIBUTES.LATITUDE.documentUuid] = options.promptUuid
        if options.experimentUuid:
            attributes[ATTRIBUTES.LATITUDE.experimentUuid] = options.experimentUuid
        if options.attributes:
            attributes.update(options.attributes)

        span_name = options.name or f"{options.provider} / {options.model}"
        span_handle = self._span(
            ctx,
            span_name,
            SpanType.Completion,
            StartSpanOptions(attributes=attributes),
        )

        def end_completion(end_options: EndCompletionSpanOptions | None = None) -> None:
            end_opts = end_options or EndCompletionSpanOptions()

            output_messages = end_opts.output or []
            json_output = self._safe_json(output_messages, "[]")
            attr_output = self._attribify_messages("output", output_messages)

            tokens = end_opts.tokens or TokenUsage()
            input_tokens = tokens.prompt + tokens.cached
            output_tokens = tokens.reasoning + tokens.completion
            finish_reason = end_opts.finishReason or ""

            end_attrs: Dict[str, Any] = {
                ATTRIBUTES.LATITUDE.response.messages: json_output,
                **attr_output,
                ATTRIBUTES.OPENTELEMETRY.GEN_AI.usage.inputTokens: input_tokens,
                ATTRIBUTES.OPENTELEMETRY.GEN_AI.usage.outputTokens: output_tokens,
                ATTRIBUTES.LATITUDE.usage.promptTokens: tokens.prompt,
                ATTRIBUTES.LATITUDE.usage.cachedTokens: tokens.cached,
                ATTRIBUTES.LATITUDE.usage.reasoningTokens: tokens.reasoning,
                ATTRIBUTES.LATITUDE.usage.completionTokens: tokens.completion,
                ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.model: options.model,
                ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.finishReasons: [finish_reason],
            }
            if end_opts.attributes:
                end_attrs.update(end_opts.attributes)

            span_handle.end(EndSpanOptions(attributes=end_attrs, endTime=end_opts.endTime))

        return CompletionSpanHandle(
            context=span_handle.context,
            end=end_completion,
            fail=span_handle.fail,
        )

    def embedding(self, ctx: Context, options: StartSpanOptions | None = None) -> SpanHandle:
        """Create an embedding span."""
        opts = options or StartSpanOptions()
        name = opts.name or SPAN_SPECIFICATIONS[SpanType.Embedding].name
        return self._span(ctx, name, SpanType.Embedding, opts)

    def _attribify_headers(self, direction: str, headers: Dict[str, str]) -> Dict[str, Any]:
        """Convert headers to span attributes."""
        prefix = (
            ATTRIBUTES.OPENTELEMETRY.HTTP.request.header
            if direction == "request"
            else ATTRIBUTES.OPENTELEMETRY.HTTP.response.header
        )

        attributes: Dict[str, Any] = {}
        for key, value in headers.items():
            field_name = self._to_kebab_case(key)
            attributes[f"{prefix}.{field_name}"] = value

        return attributes

    def http(self, ctx: Context, options: StartHttpSpanOptions) -> HttpSpanHandle:
        """Create an HTTP request span."""
        if not options.request:
            raise ValueError("request is required for http span")

        method = options.request.method.upper()
        attr_headers = self._attribify_headers("request", options.request.headers)

        if isinstance(options.request.body, str):
            final_body = options.request.body
        else:
            final_body = self._safe_json(options.request.body)

        attributes: Dict[str, Any] = {
            ATTRIBUTES.OPENTELEMETRY.HTTP.request.method: method,
            ATTRIBUTES.OPENTELEMETRY.HTTP.request.url: options.request.url,
            **attr_headers,
            ATTRIBUTES.OPENTELEMETRY.HTTP.request.body: final_body,
        }
        if options.attributes:
            attributes.update(options.attributes)

        span_name = options.name or f"{method} {options.request.url}"
        span_handle = self._span(
            ctx,
            span_name,
            SpanType.Http,
            StartSpanOptions(attributes=attributes),
        )

        def end_http(end_options: EndHttpSpanOptions) -> None:
            if not end_options.response:
                span_handle.end(None)
                return

            resp_headers = self._attribify_headers("response", end_options.response.headers)

            if isinstance(end_options.response.body, str):
                resp_body = end_options.response.body
            else:
                resp_body = self._safe_json(end_options.response.body)

            end_attrs: Dict[str, Any] = {
                ATTRIBUTES.OPENTELEMETRY.HTTP.response.statusCode: end_options.response.status,
                **resp_headers,
                ATTRIBUTES.OPENTELEMETRY.HTTP.response.body: resp_body,
            }
            if end_options.attributes:
                end_attrs.update(end_options.attributes)

            span_handle.end(EndSpanOptions(attributes=end_attrs, endTime=end_options.endTime))

        return HttpSpanHandle(
            context=span_handle.context,
            end=end_http,
            fail=span_handle.fail,
        )

    def prompt(self, ctx: Context, options: PromptSpanOptions) -> SpanHandle:
        """Create a prompt span."""
        json_parameters = self._safe_json(options.parameters or {})

        attributes: Dict[str, Any] = {
            ATTRIBUTES.LATITUDE.request.template: options.template,
            ATTRIBUTES.LATITUDE.request.parameters: json_parameters,
            ATTRIBUTES.LATITUDE.commitUuid: options.versionUuid or HEAD_COMMIT,
            ATTRIBUTES.LATITUDE.documentUuid: options.promptUuid,
            ATTRIBUTES.LATITUDE.documentLogUuid: options.documentLogUuid,
        }
        if options.projectId is not None:
            attributes[ATTRIBUTES.LATITUDE.projectId] = options.projectId
        if options.experimentUuid:
            attributes[ATTRIBUTES.LATITUDE.experimentUuid] = options.experimentUuid
        if options.testDeploymentId is not None:
            attributes[ATTRIBUTES.LATITUDE.testDeploymentId] = options.testDeploymentId
        if options.externalId:
            attributes[ATTRIBUTES.LATITUDE.externalId] = options.externalId
        if options.source:
            attributes[ATTRIBUTES.LATITUDE.source] = options.source.value
        if options.attributes:
            attributes.update(options.attributes)

        name = options.name or f"prompt-{options.promptUuid}"
        return self._span(ctx, name, SpanType.Prompt, StartSpanOptions(attributes=attributes))

    def chat(self, ctx: Context, options: ChatSpanOptions) -> SpanHandle:
        """Create a chat continuation span."""
        attributes: Dict[str, Any] = {
            ATTRIBUTES.LATITUDE.documentLogUuid: options.documentLogUuid,
        }
        if options.source:
            attributes[ATTRIBUTES.LATITUDE.source] = options.source.value
        if options.attributes:
            attributes.update(options.attributes)

        name = options.name or "chat"
        return self._span(ctx, name, SpanType.Chat, StartSpanOptions(attributes=attributes))

    def external(self, ctx: Context, options: ExternalSpanOptions) -> SpanHandle:
        """Create an external span."""
        attributes: Dict[str, Any] = {
            ATTRIBUTES.LATITUDE.documentUuid: options.promptUuid,
            ATTRIBUTES.LATITUDE.documentLogUuid: options.documentLogUuid,
            ATTRIBUTES.LATITUDE.source: (options.source or LogSources.API).value,
        }
        if options.versionUuid:
            attributes[ATTRIBUTES.LATITUDE.commitUuid] = options.versionUuid
        if options.externalId:
            attributes[ATTRIBUTES.LATITUDE.externalId] = options.externalId
        if options.attributes:
            attributes.update(options.attributes)

        name = options.name or f"external-{options.promptUuid}"
        return self._span(ctx, name, SpanType.External, StartSpanOptions(attributes=attributes))

    def unresolved_external(self, ctx: Context, options: CaptureOptions) -> SpanHandle:
        """Create an unresolved external span for capture()."""
        attributes: Dict[str, Any] = {
            ATTRIBUTES.LATITUDE.promptPath: options.path,
            ATTRIBUTES.LATITUDE.projectId: options.projectId,
        }
        if options.versionUuid:
            attributes[ATTRIBUTES.LATITUDE.commitUuid] = options.versionUuid
        if options.conversationUuid:
            attributes[ATTRIBUTES.LATITUDE.documentLogUuid] = options.conversationUuid
        if options.attributes:
            attributes.update(options.attributes)

        name = options.name or f"capture-{options.path}"
        return self._span(ctx, name, SpanType.UnresolvedExternal, StartSpanOptions(attributes=attributes))
