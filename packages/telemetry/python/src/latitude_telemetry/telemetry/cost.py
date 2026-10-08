"""
Customer-supplied LLM cost ("bring your own cost").

Cost is applied at export time by `CostAttributesExporter`, which wraps each exported span in an
attribute-override view. The original span is never mutated, so other span processors / exporters
on the host TracerProvider keep seeing exactly what the instrumentor wrote.

Where the SDK sets cost on a span it writes the standard OTel GenAI cost attributes
(`gen_ai.usage.input_cost`, `gen_ai.usage.output_cost`, `gen_ai.usage.total_cost`, USD) plus the
marker `latitude.cost.source = "user"`, and it owns the whole cost triple on that span: any cost
attribute an instrumentor already wrote is replaced or removed (see `_apply_cost`).

Precedence, highest first:

1. `set_llm_cost(span, ...)` on that specific span.
2. `capture(..., cost=...)` for LLM-call spans inside the capture.
3. `cost_resolver(usage)`.
4. `pricing` table.
5. Nothing set by the SDK: the span is exported untouched and Latitude prices it server-side.
"""

from __future__ import annotations

import logging
import math
import threading
import typing
import weakref
from collections import OrderedDict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import TypedDict

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import Span as ApiSpan

from latitude_telemetry.constants import ATTRIBUTES, COST_SOURCE_USER

logger = logging.getLogger(__name__)


class LlmCost(TypedDict, total=False):
    """Cost of one LLM call in USD. Give `input`/`output`, `total`, or all three."""

    input: float
    output: float
    total: float


class ModelPricing(TypedDict, total=False):
    """USD per 1M tokens. A missing rate counts as 0 (e.g. embeddings have no output rate)."""

    input_per_1m: float
    output_per_1m: float


@dataclass(frozen=True)
class LlmUsage:
    """What a `cost_resolver` receives for each LLM-call span."""

    provider: str | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    operation: str
    span_name: str
    attributes: Mapping[str, typing.Any]


CostResolver = Callable[[LlmUsage], "LlmCost | None"]

# Every cost key the ingest pipeline reads. When the SDK sets cost it strips all of them before
# writing its own, so a stale instrumentor figure can never be read alongside (or instead of) ours.
_COST_KEYS_TO_STRIP: tuple[str, ...] = (
    ATTRIBUTES.cost_input,
    ATTRIBUTES.cost_output,
    ATTRIBUTES.cost_total,
    "gen_ai.usage.cost",
    "llm.cost.prompt",
    "llm.cost.completion",
    "llm.cost.total",
)

# ─── LLM-call span detection ──────────────────────────────────────────────────
# Mirrors Latitude ingest (packages/domain/spans/src/otlp/resolvers/operation.ts): the trace
# rollup only counts usage/cost on these operations, so those are the only spans the SDK prices.

USAGE_OPERATIONS: frozenset[str] = frozenset({"chat", "text_completion", "generate_content", "embeddings", "reranker"})

_GENAI_OPERATION = {"rerank": "reranker"}
_OPENINFERENCE_OPERATION = {"LLM": "chat", "EMBEDDING": "embeddings", "RERANKER": "reranker"}
_OPENLLMETRY_OPERATION = {"completion": "text_completion", "embedding": "embeddings", "rerank": "reranker"}
# Vercel AI SDK: only the provider-call leaves. Wrappers (ai.generateText, ai.embed, ...) repeat
# their leaves' usage, so pricing them too would double count.
_VERCEL_OPERATION = {
    "ai.generateText.doGenerate": "chat",
    "ai.streamText.doStream": "chat",
    "ai.generateObject.doGenerate": "chat",
    "ai.streamObject.doStream": "chat",
    "ai.embed.doEmbed": "embeddings",
    "ai.embedMany.doEmbed": "embeddings",
}

# CrewAI's OpenInference instrumentor puts the whole conversation (and usage) on its AGENT span,
# with no LLM leaf; ingest counts that span as `chat`, so the SDK prices it too.
_CREWAI_OPENINFERENCE_SCOPE = "openinference.instrumentation.crewai"

_INPUT_TOKEN_KEYS = (
    "gen_ai.usage.input_tokens",
    "gen_ai.usage.prompt_tokens",
    "llm.token_count.prompt",
    "ai.usage.promptTokens",
    "ai.usage.inputTokens",
)
_OUTPUT_TOKEN_KEYS = (
    "gen_ai.usage.output_tokens",
    "gen_ai.usage.completion_tokens",
    "llm.token_count.completion",
    "ai.usage.completionTokens",
    "ai.usage.outputTokens",
)
_PROVIDER_KEYS = ("gen_ai.provider.name", "gen_ai.model.provider", "gen_ai.system", "llm.system", "llm.provider")
# Vercel AI SDK names the provider by its API surface ("openai.chat"); only the vendor is kept.
_VERCEL_PROVIDER_KEY = "ai.model.provider"
_MODEL_KEYS = ("gen_ai.response.model", "gen_ai.request.model", "llm.model_name", "ai.model.id")


def _str_attr(attrs: Mapping[str, typing.Any], key: str) -> str | None:
    value = attrs.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _first_str(attrs: Mapping[str, typing.Any], keys: Sequence[str]) -> str | None:
    for key in keys:
        value = _str_attr(attrs, key)
        if value is not None:
            return value
    return None


def _first_int(attrs: Mapping[str, typing.Any], keys: Sequence[str]) -> int | None:
    for key in keys:
        value = attrs.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float) and math.isfinite(value):
            return int(value)
    return None


def _scope_name(span: ReadableSpan) -> str:
    scope = getattr(span, "instrumentation_scope", None)
    return (getattr(scope, "name", "") or "") if scope is not None else ""


def _provider(attrs: Mapping[str, typing.Any]) -> str | None:
    provider = _first_str(attrs, _PROVIDER_KEYS)
    if provider is not None:
        return provider
    vercel = _str_attr(attrs, _VERCEL_PROVIDER_KEY)
    return vercel.split(".", 1)[0] if vercel is not None else None


def usage_operation(attrs: Mapping[str, typing.Any], scope_name: str = "") -> str | None:
    """The span's operation if it is an LLM call Latitude counts usage for, else None."""
    if attrs.get("latitude.capture.root"):
        return None
    operation: str | None = None
    genai = _str_attr(attrs, "gen_ai.operation.name")
    if genai is not None:
        operation = _GENAI_OPERATION.get(genai, genai)
    else:
        kind = _str_attr(attrs, "openinference.span.kind")
        if kind is not None and kind.upper() == "AGENT" and scope_name.startswith(_CREWAI_OPENINFERENCE_SCOPE):
            operation = "chat"
        elif kind is not None:
            operation = _OPENINFERENCE_OPERATION.get(kind.upper(), kind.lower())
        else:
            request_type = _str_attr(attrs, "llm.request.type")
            if request_type is not None:
                operation = _OPENLLMETRY_OPERATION.get(request_type, request_type)
            else:
                vercel = _str_attr(attrs, "ai.operationId")
                if vercel is not None:
                    operation = _VERCEL_OPERATION.get(vercel)
    return operation if operation in USAGE_OPERATIONS else None


def extract_usage(span: ReadableSpan, operation: str) -> LlmUsage:
    attrs: Mapping[str, typing.Any] = span.attributes or {}
    return LlmUsage(
        provider=_provider(attrs),
        model=_first_str(attrs, _MODEL_KEYS),
        input_tokens=_first_int(attrs, _INPUT_TOKEN_KEYS),
        output_tokens=_first_int(attrs, _OUTPUT_TOKEN_KEYS),
        operation=operation,
        span_name=span.name,
        attributes=dict(attrs),
    )


# ─── Cost normalization ───────────────────────────────────────────────────────


def _valid_amount(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def normalize_cost(cost: object, *, source: str) -> dict[str, float] | None:
    """
    Validate a user cost dict and fill in the total.

    Returns `{"input"?, "output"?, "total"}` or None when nothing usable was given. An explicit 0 is
    a valid cost. When `total` is absent it becomes input + output (a missing side counts as 0), so
    an instrumentor's stale total can never survive next to the SDK's own sides.
    """
    if cost is None:
        return None
    if not isinstance(cost, Mapping):
        logger.warning("[Latitude] Ignoring %s cost: expected a dict, got %s", source, type(cost).__name__)
        return None
    raw = typing.cast(Mapping[str, object], cost)
    normalized: dict[str, float] = {}
    for key in ("input", "output", "total"):
        if key not in raw or raw[key] is None:
            continue
        value = raw[key]
        if not _valid_amount(value):
            logger.warning("[Latitude] Ignoring %s cost %r=%r: expected a finite number >= 0", source, key, value)
            continue
        normalized[key] = float(typing.cast(float, value))
    if not normalized:
        return None
    if "total" not in normalized:
        normalized["total"] = normalized.get("input", 0.0) + normalized.get("output", 0.0)
    return normalized


def normalize_pricing(pricing: Mapping[str, ModelPricing] | None) -> dict[str, tuple[float, float]]:
    """Lower-cases `provider/model` keys and validates rates. Invalid entries are dropped with a warning."""
    table: dict[str, tuple[float, float]] = {}
    if not pricing:
        return table
    for key, entry in pricing.items():
        if not isinstance(key, str) or "/" not in key or not isinstance(entry, Mapping):
            logger.warning("[Latitude] Ignoring pricing entry %r: expected '<provider>/<model>' -> rates", key)
            continue
        rates = typing.cast(Mapping[str, object], entry)
        input_rate = rates.get("input_per_1m")
        output_rate = rates.get("output_per_1m")
        if input_rate is None and output_rate is None:
            logger.warning("[Latitude] Ignoring pricing entry %r: set input_per_1m and/or output_per_1m", key)
            continue
        if (input_rate is not None and not _valid_amount(input_rate)) or (
            output_rate is not None and not _valid_amount(output_rate)
        ):
            logger.warning("[Latitude] Ignoring pricing entry %r: rates must be finite numbers >= 0", key)
            continue
        table[key.strip().lower()] = (
            float(typing.cast(float, input_rate or 0.0)),
            float(typing.cast(float, output_rate or 0.0)),
        )
    return table


def _price(table: Mapping[str, tuple[float, float]], span: ReadableSpan, usage: LlmUsage) -> dict[str, float] | None:
    if not table or (usage.input_tokens is None and usage.output_tokens is None):
        return None
    attrs: Mapping[str, typing.Any] = span.attributes or {}
    provider = usage.provider
    if provider is None:
        return None
    rates: tuple[float, float] | None = None
    # Response model first (what actually ran), then the requested one.
    for model_key in _MODEL_KEYS:
        model = _str_attr(attrs, model_key)
        if model is None:
            continue
        rates = table.get(f"{provider}/{model}".lower())
        if rates is not None:
            break
    if rates is None:
        return None
    input_cost = (usage.input_tokens or 0) * rates[0] / 1_000_000
    output_cost = (usage.output_tokens or 0) * rates[1] / 1_000_000
    return {"input": input_cost, "output": output_cost, "total": input_cost + output_cost}


# ─── Explicit per-span cost (set_llm_cost) ────────────────────────────────────

_MAX_PENDING = 8192
_explicit_lock = threading.Lock()
_explicit_costs: OrderedDict[tuple[int, int], dict[str, float]] = OrderedDict()


def _span_key(span: ReadableSpan | ApiSpan) -> tuple[int, int] | None:
    ctx = span.get_span_context()
    if ctx is None or not ctx.is_valid:
        return None
    return (ctx.trace_id, ctx.span_id)


def _remember(
    store: OrderedDict[tuple[int, int], dict[str, float]], key: tuple[int, int], cost: dict[str, float]
) -> None:
    store[key] = cost
    store.move_to_end(key)
    while len(store) > _MAX_PENDING:
        store.popitem(last=False)


def set_llm_cost(
    span: ApiSpan,
    *,
    input: float | None = None,
    output: float | None = None,
    total: float | None = None,
) -> None:
    """
    Set the cost (USD) of the LLM call `span` represents.

    Writes `gen_ai.usage.input_cost` / `output_cost` / `total_cost` and `latitude.cost.source="user"`
    on the live span. When `total` is omitted it is input + output. A cost set here wins over
    `capture(cost=...)`, `cost_resolver` and `pricing`, and over any cost an instrumentor writes on
    the same span (Latitude re-applies it at export). An explicit 0 is honoured.
    """
    cost = normalize_cost({"input": input, "output": output, "total": total}, source="set_llm_cost")
    if cost is None:
        logger.warning("[Latitude] set_llm_cost called without a valid input, output or total; ignoring")
        return
    if not span.is_recording():
        return
    for key, attribute in (("input", ATTRIBUTES.cost_input), ("output", ATTRIBUTES.cost_output)):
        if key in cost:
            span.set_attribute(attribute, cost[key])
    span.set_attribute(ATTRIBUTES.cost_total, cost["total"])
    span.set_attribute(ATTRIBUTES.cost_source, COST_SOURCE_USER)
    key = _span_key(span)
    if key is not None:
        with _explicit_lock:
            _remember(_explicit_costs, key, cost)


def _pop_explicit_cost(key: tuple[int, int]) -> dict[str, float] | None:
    with _explicit_lock:
        return _explicit_costs.pop(key, None)


# ─── Per-processor bookkeeping and export wrapper ─────────────────────────────


class SpanCostTracker:
    """
    Resolves each span's cost when it ends and carries it to export without touching the span.

    `on_start` records the capture-context cost by span id. `on_end` resolves the final cost from
    the ended span *before* redaction runs (so a redaction rule can't hide the attributes cost is
    resolved from) and keeps it in a WeakKeyDictionary keyed by the ended ReadableSpan, which the
    export wrapper reads by identity. Entries vanish with the span, so filtered-out spans don't leak.
    """

    def __init__(self, resolution: CostResolution) -> None:
        self._resolution = resolution
        self._lock = threading.Lock()
        self._capture: OrderedDict[tuple[int, int], dict[str, float]] = OrderedDict()
        self._costs: weakref.WeakKeyDictionary[ReadableSpan, dict[str, float]] = weakref.WeakKeyDictionary()

    def on_start(self, span: ReadableSpan, capture_cost: dict[str, float] | None) -> None:
        if capture_cost is None:
            return
        key = _span_key(span)
        if key is None:
            return
        with self._lock:
            _remember(self._capture, key, capture_cost)

    def on_end(self, span: ReadableSpan) -> None:
        key = _span_key(span)
        if key is None:
            return
        explicit = _pop_explicit_cost(key)
        with self._lock:
            capture = self._capture.pop(key, None)
        try:
            cost = self._resolution.resolve(span, explicit=explicit, capture=capture)
        except Exception:
            logger.warning("[Latitude] Failed to resolve LLM cost; exporting span unchanged", exc_info=True)
            return
        if cost is None:
            return
        with self._lock:
            try:
                self._costs[span] = cost
            except TypeError:  # non-weakrefable custom span
                return

    def cost_for(self, span: ReadableSpan) -> dict[str, float] | None:
        with self._lock:
            try:
                return self._costs.get(span)
            except TypeError:
                return None

    def clear(self) -> None:
        with self._lock:
            self._capture.clear()
            self._costs.clear()


class _AttributeOverrideSpan:
    """ReadableSpan-shaped view that replaces `attributes` and delegates everything else."""

    def __init__(self, span: ReadableSpan, attributes: Mapping[str, typing.Any]) -> None:
        self._span = span
        self._attributes_override = attributes

    @property
    def attributes(self) -> Mapping[str, typing.Any]:
        return self._attributes_override

    def __getattr__(self, name: str) -> typing.Any:
        return getattr(self._span, name)


def _apply_cost(attrs: Mapping[str, typing.Any], cost: Mapping[str, float]) -> dict[str, typing.Any]:
    """
    The SDK owns the cost triple once it sets cost: every instrumentor cost key is dropped, then the
    SDK's keys are written. Total-only therefore drops instrumentor input/output costs instead of
    leaving sides that no longer add up to the user's total.
    """
    merged = {k: v for k, v in attrs.items() if k not in _COST_KEYS_TO_STRIP}
    if "input" in cost:
        merged[ATTRIBUTES.cost_input] = cost["input"]
    if "output" in cost:
        merged[ATTRIBUTES.cost_output] = cost["output"]
    merged[ATTRIBUTES.cost_total] = cost["total"]
    merged[ATTRIBUTES.cost_source] = COST_SOURCE_USER
    return merged


class CostResolution:
    """Decides the SDK cost for one ended span (or None to leave it untouched)."""

    def __init__(
        self,
        pricing: Mapping[str, ModelPricing] | None = None,
        cost_resolver: CostResolver | None = None,
    ) -> None:
        self._pricing = normalize_pricing(pricing)
        self._resolver = cost_resolver

    def resolve(
        self,
        span: ReadableSpan,
        *,
        explicit: dict[str, float] | None = None,
        capture: dict[str, float] | None = None,
    ) -> dict[str, float] | None:
        if explicit is not None:
            return explicit
        attrs: Mapping[str, typing.Any] = span.attributes or {}
        if attrs.get(ATTRIBUTES.cost_source) == COST_SOURCE_USER:
            # Marked by the user (set_llm_cost from another process, or set by hand): trust it as-is.
            return None
        operation = usage_operation(attrs, _scope_name(span))
        if operation is None:
            return None
        if capture is not None:
            return capture
        if self._resolver is None and not self._pricing:
            return None
        usage = extract_usage(span, operation)
        if self._resolver is not None:
            try:
                resolved = normalize_cost(self._resolver(usage), source="cost_resolver")
            except Exception:
                logger.warning("[Latitude] cost_resolver raised; falling back to pricing", exc_info=True)
                resolved = None
            if resolved is not None:
                return resolved
        return _price(self._pricing, span, usage)


class CostAttributesExporter(SpanExporter):
    """
    Wraps a SpanExporter and stamps the cost `SpanCostTracker` resolved at `on_end` onto each
    exported span through an attribute-override view (same pattern as
    `_ServiceNameResourceExporter`). Spans the SDK has no cost for pass through as the original objects.
    """

    def __init__(self, inner: SpanExporter, tracker: SpanCostTracker) -> None:
        self._inner = inner
        self._tracker = tracker

    def export(self, spans: typing.Sequence[ReadableSpan]) -> SpanExportResult:
        out: list[ReadableSpan] = []
        for span in spans:
            cost = self._tracker.cost_for(span)
            if cost is None:
                out.append(span)
            else:
                out.append(
                    typing.cast(ReadableSpan, _AttributeOverrideSpan(span, _apply_cost(span.attributes or {}, cost)))
                )
        return self._inner.export(out)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)
