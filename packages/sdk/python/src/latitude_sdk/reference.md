# Reference
## Account
<details><summary><code>client.account.<a href="src/latitude_sdk/account/client.py">bootstrap</a>(...) -> BootstrapAccountResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a temporary organization with an API key and a project, and returns a link to claim ownership of it. Requires no authentication.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.account.bootstrap()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**organization_name:** `typing.Optional[str]` — Name for the temporary organization. If not provided, defaults to "My Organization".
    
</dd>
</dl>

<dl>
<dd>

**project_name:** `typing.Optional[str]` — Name for the project created in the organization. If not provided, defaults to "My Project".
    
</dd>
</dl>

<dl>
<dd>

**user_email:** `typing.Optional[str]` — Email address to send the claim link to.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.account.<a href="src/latitude_sdk/account/client.py">get</a>() -> AccountResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the caller's account snapshot: the organization the request is scoped to, plus the user record and their role when the request was made by a real user (OAuth). API-key callers receive `user: null` and `role: null` because API keys aren't tied to a specific user.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.account.get()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Projects
<details><summary><code>client.projects.<a href="src/latitude_sdk/projects/client.py">list</a>() -> PaginatedProjects</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns every project in the organization. The response uses the standard paginated shape; the project list currently fits in a single page (`nextCursor` is always `null`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.projects.list()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.projects.<a href="src/latitude_sdk/projects/client.py">create</a>(...) -> Project</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a new project within the organization. The name must be unique within the org.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.projects.create(
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `str` — Human-readable name for the project. Must be unique within the organization.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.projects.<a href="src/latitude_sdk/projects/client.py">get</a>(...) -> Project</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single project by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.projects.get(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.projects.<a href="src/latitude_sdk/projects/client.py">delete</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a project by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.projects.delete(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.projects.<a href="src/latitude_sdk/projects/client.py">update</a>(...) -> Project</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Updates a project's name and/or settings. Renaming never changes the slug, and the slug cannot be changed via the API (only from the dashboard). Use `id` or `slug` as stable references.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.projects.update(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` — New human-readable name. Renaming never changes the slug.
    
</dd>
</dl>

<dl>
<dd>

**settings:** `typing.Optional[ProjectSettingsPatch]` 
    
</dd>
</dl>

<dl>
<dd>

**flaggers:** `typing.Optional[UpdateProjectBodyFlaggers]` — Enable or disable specific flaggers for the project. Keys are flagger slugs; values are the new `enabled` state. Omitted slugs are left untouched.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scores
<details><summary><code>client.scores.<a href="src/latitude_sdk/scores/client.py">create</a>(...) -> ScoreResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). Annotations use the separate `/annotations` endpoint.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient, CreateCustomScoreBody, TraceRef_Id
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.scores.create(
    project_slug="projectSlug",
    request=CreateCustomScoreBody(
        value=1.1,
        passed=True,
        feedback="feedback",
        trace=TraceRef_Id(
            id="id",
        ),
        source_id="sourceId",
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `CreateScoreBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Annotations
<details><summary><code>client.annotations.<a href="src/latitude_sdk/annotations/client.py">create</a>(...) -> Annotation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a published annotation score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). When called with an OAuth token, the annotation is attributed to the authenticated user.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient, TraceRef_Id
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.annotations.create(
    project_slug="projectSlug",
    value=1.1,
    passed=True,
    feedback="feedback",
    trace=TraceRef_Id(
        id="id",
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**value:** `float` — Normalized score value in [0, 1]. Higher = better.
    
</dd>
</dl>

<dl>
<dd>

**passed:** `bool` — Whether the annotated output passes the reviewer's bar.
    
</dd>
</dl>

<dl>
<dd>

**feedback:** `str` — Free-text feedback explaining the score. Surfaced alongside the trace.
    
</dd>
</dl>

<dl>
<dd>

**trace:** `TraceRef` 
    
</dd>
</dl>

<dl>
<dd>

**simulation_id:** `typing.Optional[str]` — Simulation this annotation is tied to, if any. `null` (default) when not part of a simulation.
    
</dd>
</dl>

<dl>
<dd>

**signal_id:** `typing.Optional[str]` — Pre-selected signal this annotation belongs to. Leave `null` (default) to let the automatic signal-discovery pipeline route the annotation.
    
</dd>
</dl>

<dl>
<dd>

**anchor:** `typing.Optional[AnnotationAnchor]` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Traces
<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">list</a>(...) -> PaginatedTraces</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of traces in the project. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Trace list rows exclude per-message LLM content — use `getTrace` for the full conversation view.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListTracesBodySortBy]` — Field to sort by. Defaults to `startTime`. Pass `relevance` together with `query` to rank by semantic match (best match first, then most recent).
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListTracesBodySortDirection]` — Sort direction. Defaults to `desc` (most recent first).
    
</dd>
</dl>

<dl>
<dd>

**query:** `typing.Optional[str]` — Free-text semantic search across the trace's input and output messages. Combined with `filters` via AND.
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[TraceFilterSet]` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">analytics</a>(...) -> TraceAnalyticsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns trace analytics for the project: a total (or median) per metric over the requested range, plus a per-bucket series for each metric. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.analytics(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">get</a>(...) -> TraceDetail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single trace by id, including its `conversation`: the system instructions and the messages of the trace's last LLM-completion span, in OpenTelemetry GenAI format.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.get(
    project_slug="projectSlug",
    trace_id="traceId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">list_spans</a>(...) -> TraceSpans</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns every span belonging to the trace, ordered by `startTime` ascending. Spans carry the OpenTelemetry envelope (kind, status, attributes, resource) plus Latitude's GenAI enrichment (tokens, cost, operation, provider, model). Per-message LLM content is excluded for size; use a span point-lookup for the conversation payload.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.list_spans(
    project_slug="projectSlug",
    trace_id="traceId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">get_span</a>(...) -> SpanDetail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns one span by id, including the LLM conversation (system instructions, input messages, output messages), tool data (definitions, call id, input, output), and the full OpenTelemetry payload (attributes, resource, events, links) that's excluded from the lighter list shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.get_span(
    project_slug="projectSlug",
    trace_id="traceId",
    span_id="spanId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**span_id:** `str` — 16-character span identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">list_annotations</a>(...) -> PaginatedTraceAnnotations</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of annotations pinned to the trace, including both published annotations and drafts.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.list_annotations(
    project_slug="projectSlug",
    trace_id="traceId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">get_annotation</a>(...) -> Annotation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns one annotation by id pinned to the trace.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.get_annotation(
    project_slug="projectSlug",
    trace_id="traceId",
    annotation_id="annotationId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**annotation_id:** `str` — Stable annotation identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">get_memory</a>(...) -> SessionMemorySummary</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the trace's memory footprint: per-record read, added, and removed token metrics plus totals, scoped to this trace.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.get_memory(
    project_slug="projectSlug",
    trace_id="traceId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">get_memory_changes</a>(...) -> SessionMemoryChanges</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the memory writes the trace made as per-record before/after diffs, scoped to this trace.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.get_memory_changes(
    project_slug="projectSlug",
    trace_id="traceId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `str` — 32-character trace identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.traces.<a href="src/latitude_sdk/traces/client.py">export</a>(...) -> ExportTracesResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Enqueues a CSV export of the traces matched by `traces`. The export runs asynchronously; a download link is emailed to `recipient` when the file is ready. The response returns immediately with `status = "queued"`. The recipient must already be a member of the requesting organization.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient, TracesRef_Ids
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.traces.export(
    project_slug="projectSlug",
    traces=TracesRef_Ids(
        ids=[
            "ids"
        ],
    ),
    recipient="recipient",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**traces:** `TracesRef` 
    
</dd>
</dl>

<dl>
<dd>

**recipient:** `str` — Email address the export download link is sent to. Must belong to a member of the requesting organization — otherwise the request is rejected with 400.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Tools
<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">list</a>(...) -> ToolsAnalyticsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns every tool in the project over the range — the union of defined and called tools — with per-tool usage metrics, offered counts, a call trend, and project-wide totals. The range defaults to the trailing 7 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**trend_bucket_seconds:** `typing.Optional[int]` — Bucket width in seconds. Derived from the range (~30 buckets) when omitted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">histogram</a>(...) -> ToolHistogramResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns per-bucket call counts over the range. Omit `toolName` to aggregate across every tool in the project; pass it to scope the histogram to a single tool.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.histogram(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `typing.Optional[str]` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**bucket_seconds:** `typing.Optional[int]` — Bucket width in seconds. Derived from the range (~30 buckets) when omitted.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[HistogramToolsRequestErrorsOnly]` — When `true`, scope every aggregate to failed calls only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">parameters</a>(...) -> ToolParameterStatsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the most common top-level input keys and their most common values for the tool, computed over a sample of the most recent calls in the range.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.parameters(
    project_slug="projectSlug",
    tool_name="toolName",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `str` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**top_keys:** `typing.Optional[int]` — Maximum number of keys to return.
    
</dd>
</dl>

<dl>
<dd>

**top_values_per_key:** `typing.Optional[int]` — Maximum number of values to return per key.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[ParametersToolsRequestErrorsOnly]` — When `true`, scope every aggregate to failed calls only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">context</a>(...) -> ToolContextBreakdownResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns where the tool is used, broken down by a dimension: `model` and `provider` attribute the tool's traces via their chat spans; `tag` reads tags on the tool-call spans themselves.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.context(
    project_slug="projectSlug",
    tool_name="toolName",
    dimension="model",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `str` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**dimension:** `ContextToolsRequestDimension` — Dimension to break the usage down by.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[ContextToolsRequestErrorsOnly]` — When `true`, scope every aggregate to failed calls only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">co_occurrence</a>(...) -> ToolCoOccurrenceResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns other tools called in the same traces as this one, ranked by shared trace count.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.co_occurrence(
    project_slug="projectSlug",
    tool_name="toolName",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `str` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Maximum number of tools to return.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[CoOccurrenceToolsRequestErrorsOnly]` — When `true`, scope every aggregate to failed calls only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">errors</a>(...) -> ToolErrorBreakdownResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the most common error outputs of the tool's failed calls, grouped into clusters by a normalized form so variable fragments don't split one error into many buckets.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.errors(
    project_slug="projectSlug",
    tool_name="toolName",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `str` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Maximum number of clusters to return.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">list_calls</a>(...) -> PaginatedToolCalls</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of the tool's most recent calls, newest first, with payloads truncated to a bounded preview. Use a span point-lookup for full payloads.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.list_calls(
    project_slug="projectSlug",
    tool_name="toolName",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `str` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 50.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[ListCallsToolsRequestErrorsOnly]` — When `true`, scope every aggregate to failed calls only.
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tools.<a href="src/latitude_sdk/tools/client.py">get</a>(...) -> ToolDetailResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the latest definition seen for the tool plus its global usage metrics. Pass `errorsOnly=true` to also include failed-calls-only metrics for failure analysis.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.tools.get(
    project_slug="projectSlug",
    tool_name="toolName",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**tool_name:** `str` — Tool name. URL-encode names containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[GetToolsRequestErrorsOnly]` — When `true`, scope every aggregate to failed calls only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Users
<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">list</a>(...) -> UserListResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a page of the project's identified end-users over the range, each with trace, session, token, and cost metrics, plus cost aggregates across every matching user. The range defaults to the trailing 30 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Max 100.
    
</dd>
</dl>

<dl>
<dd>

**offset:** `typing.Optional[int]` — Zero-based offset of the first user to return.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListUsersRequestSortBy]` — Field to sort by. Defaults to most recently seen.
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListUsersRequestSortDirection]` — Sort direction. Defaults to descending.
    
</dd>
</dl>

<dl>
<dd>

**search_query:** `typing.Optional[str]` — Case-insensitive substring match on the user's id or email.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">overview</a>(...) -> UsersOverviewResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns project-wide end-user aggregates over the range — unique and new users, identified vs total traces and sessions — plus a per-bucket activity histogram. The range defaults to the trailing 30 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.overview(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">activity</a>(...) -> UserActivityResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the end-user's per-bucket session activity across the range, oldest first. The range defaults to the trailing 30 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.activity(
    project_slug="projectSlug",
    user_id="userId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `str` — End-user identifier. URL-encode values containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[ActivityUsersRequestErrorsOnly]` — When `true`, scope every aggregate to errored traces only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">usage</a>(...) -> UserUsageResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the end-user's top values of a usage dimension — `model`, `provider`, or `tool` — ranked by distinct trace count.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.usage(
    project_slug="projectSlug",
    user_id="userId",
    dimension="model",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `str` — End-user identifier. URL-encode values containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**dimension:** `UsageUsersRequestDimension` — Dimension to break the usage down by.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Maximum number of values to return.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[UsageUsersRequestErrorsOnly]` — When `true`, scope every aggregate to errored traces only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">signals</a>(...) -> UserSignalsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the signals that occurred on the end-user's traces, most recent occurrence first. Occurrence counts are scoped to the user; signal identity and lifecycle states are the project's.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.signals(
    project_slug="projectSlug",
    user_id="userId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `str` — End-user identifier. URL-encode values containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Maximum number of signals to return.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">behaviours</a>(...) -> UserBehavioursResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the behaviour clusters observed on the end-user's sessions, most frequent first. Counts are scoped to the user; cluster identity comes from the project taxonomy.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.behaviours(
    project_slug="projectSlug",
    user_id="userId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `str` — End-user identifier. URL-encode values containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Maximum number of behaviours to return.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">memory_stores</a>(...) -> UserMemoryStores</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the memory stores the end-user accessed (reads and writes both count as access), most recent access first. Capped at the 1000 most recent stores. Each store links to the memory browsing operations under the `memory` group.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.memory_stores(
    project_slug="projectSlug",
    user_id="userId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `str` — End-user identifier. URL-encode values containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.users.<a href="src/latitude_sdk/users/client.py">get</a>(...) -> UserProfileResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the lifetime profile of one end-user — trace, session, token, cost, and activity rollups across all of the user's traces (not range-bound).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.users.get(
    project_slug="projectSlug",
    user_id="userId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `str` — End-user identifier. URL-encode values containing special characters.
    
</dd>
</dl>

<dl>
<dd>

**errors_only:** `typing.Optional[GetUsersRequestErrorsOnly]` — When `true`, scope every aggregate to errored traces only.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## SavedSearches
<details><summary><code>client.saved_searches.<a href="src/latitude_sdk/saved_searches/client.py">list</a>(...) -> PaginatedSavedSearches</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns every saved search in the project. The response uses the standard paginated shape; the saved-search list currently fits in a single page (`nextCursor` is always `null`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.saved_searches.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.saved_searches.<a href="src/latitude_sdk/saved_searches/client.py">create</a>(...) -> SavedSearch</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a saved search within the project. At least one of `query` or `filters` must be set. The slug is derived from `name`. OAuth-authenticated only.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.saved_searches.create(
    project_slug="projectSlug",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — Human-readable name. Used to derive the slug.
    
</dd>
</dl>

<dl>
<dd>

**query:** `typing.Optional[str]` — Free-text semantic query. `null` (default) when the search is filter-only. At least one of `query` or `filters` must be set.
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[typing.Dict[str, typing.List[FilterCondition]]]` — Structured filter set. Defaults to `{}` (no filters). At least one of `query` or `filters` must be set.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.saved_searches.<a href="src/latitude_sdk/saved_searches/client.py">get</a>(...) -> SavedSearch</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single saved search by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.saved_searches.get(
    project_slug="projectSlug",
    search_slug="searchSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**search_slug:** `str` — Saved-search slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.saved_searches.<a href="src/latitude_sdk/saved_searches/client.py">delete</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a saved search by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.saved_searches.delete(
    project_slug="projectSlug",
    search_slug="searchSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**search_slug:** `str` — Saved-search slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.saved_searches.<a href="src/latitude_sdk/saved_searches/client.py">update</a>(...) -> SavedSearch</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Updates a saved search. Renaming may regenerate the slug — clients should re-read the response or rely on the `id` for stable references.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.saved_searches.update(
    project_slug="projectSlug",
    search_slug="searchSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**search_slug:** `str` — Saved-search slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` — New human-readable name. Triggers slug regeneration when the change affects the slug form (cosmetic edits like capitalization keep the URL stable).
    
</dd>
</dl>

<dl>
<dd>

**query:** `typing.Optional[str]` — Replace the free-text query. Pass `null` to clear it.
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[typing.Dict[str, typing.List[FilterCondition]]]` — Replace the structured filter set.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.saved_searches.<a href="src/latitude_sdk/saved_searches/client.py">list_traces</a>(...) -> PaginatedTraces</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of traces that match the saved search's `query` + `filters`. Each row uses the same `Trace` shape as `listTraces` — use the trace point-lookup endpoints (`getTrace`, `listTraceSpans`, `getTraceSpan`, `listTraceAnnotations`) to drill into individual traces.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.saved_searches.list_traces(
    project_slug="projectSlug",
    search_slug="searchSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**search_slug:** `str` — Saved-search slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListTracesSavedSearchesRequestSortBy]` — Field to sort by. Defaults to `startTime`. Pass `relevance` to rank by semantic match against the saved search's query (best match first, then most recent).
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListTracesSavedSearchesRequestSortDirection]` — Sort direction. Defaults to `desc` (most recent first).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Signals
<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">list</a>(...) -> PaginatedSignals</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of signals in the project. Each item includes lifecycle `states` plus time-window stats: `firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedSessionsPercent`, `trend`, and `tags`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**query:** `typing.Optional[str]` — Free-text semantic search across the signals' names and descriptions.
    
</dd>
</dl>

<dl>
<dd>

**lifecycle_group:** `typing.Optional[ListSignalsRequestLifecycleGroup]` — `"active"` for signals that are neither resolved nor ignored; `"archived"` for resolved or ignored signals. Omit to include both.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListSignalsRequestSortBy]` — Sort field. `lastSeen` orders by most recent occurrence; `occurrences` by total count in the time window; `state` by lifecycle priority.
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListSignalsRequestSortDirection]` — Sort direction. Defaults to `desc`.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time window. Defaults to ~6 days ago.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time window. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">create</a>(...) -> CreateSignalResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a user-defined signal with its membership detector — from `settings` (a `judge` LLM detector or a deterministic `rule`), or a raw `script` (advanced). The script is validated at save time (422 on a compile error). Detectors collect forward from creation; there is no historical backfill.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment
from latitude_sdk.signals import CreateSignalBodyEvaluationSettings, CreateSignalBodyEvaluationSettingsSettings_Judge

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.create(
    project_slug="projectSlug",
    name="name",
    description="description",
    evaluation=CreateSignalBodyEvaluationSettings(
        settings=CreateSignalBodyEvaluationSettingsSettings_Judge(
            criteria="criteria",
        ),
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — Human-readable name. Used to derive the slug.
    
</dd>
</dl>

<dl>
<dd>

**description:** `str` — What this signal captures.
    
</dd>
</dl>

<dl>
<dd>

**evaluation:** `CreateSignalBodyEvaluation` — The signal's membership detector. Provide exactly one of `settings` or `script`.
    
</dd>
</dl>

<dl>
<dd>

**priority:** `typing.Optional[CreateSignalBodyPriority]` — Manual triage priority. Null/omitted leaves it unset.
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[typing.Dict[str, typing.Optional[typing.List[FilterCondition]]]]` — Row-local pre-gate restricting which traces the evaluation runs against. Omitted = all traces.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">get</a>(...) -> SignalDetail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the full-history detail view of one signal: lifecycle `states`, lifetime activity stats (`firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedSessionsPercent`, `tags`), a 14-day occurrence `trend`, the active `evaluations` monitoring it, and the current `monitoringState`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.get(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">delete</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Soft-deletes a signal and archives its detector so it stops matching new traces. Existing scores are retained but excluded from reads; the slug becomes reusable.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.delete(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">update</a>(...) -> UpdateSignalResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Updates a signal's name, description, and evaluation pre-gate `filters`. Filter changes apply forward-only — existing membership is never re-evaluated. The slug is stable.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.update(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` — New name. Omitted leaves it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**description:** `typing.Optional[str]` — New description. Omitted leaves it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[typing.Dict[str, typing.Optional[typing.List[FilterCondition]]]]` — New evaluation pre-gate. Explicit `null` clears it; omitted leaves it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">analytics</a>(...) -> SignalAnalyticsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns signal analytics for the project: counts of ongoing, new, and escalating signals, plus total occurrences and a per-bucket occurrence series. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.analytics(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">trend</a>(...) -> SignalHistogram</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the occurrence histogram for one signal over `[fromIso, toIso]`. The default range is the trailing 14 days. Buckets are 12-hour wide and UTC-aligned.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.trend(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive). Defaults to ~14 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive). Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">list_traces</a>(...) -> PaginatedTraces</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the page of distinct traces that contributed at least one occurrence of the signal, ordered by most recent activity first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.list_traces(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">resolve</a>(...) -> SignalsLifecycleResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Marks each signal in `signalIds` as resolved, archiving it and re-enabling its notifications. Unless `keepMonitoring` is `false`, linked evaluations keep running so a new occurrence reopens the signal as regressed.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.resolve(
    project_slug="projectSlug",
    signal_ids=[
        "signalIds"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_ids:** `typing.List[str]` — Non-empty list of signal ids. Operations are idempotent — already-applied signals are unchanged.
    
</dd>
</dl>

<dl>
<dd>

**keep_monitoring:** `typing.Optional[bool]` — Whether linked evaluations keep running after the resolve, so regressions are detected. Defaults to the project setting.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">unresolve</a>(...) -> SignalsLifecycleResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Reopens each signal in `signalIds` without marking it as regressed, re-enabling its notifications.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.unresolve(
    project_slug="projectSlug",
    signal_ids=[
        "signalIds"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `SignalsLifecycleBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">ignore</a>(...) -> SignalsLifecycleResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Marks each signal in `signalIds` as ignored, archiving it. Monitoring is stopped and notifications are also muted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.ignore(
    project_slug="projectSlug",
    signal_ids=[
        "signalIds"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `SignalsLifecycleBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">unignore</a>(...) -> SignalsLifecycleResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns each signal in `signalIds` to the active list and re-enables its notifications.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.unignore(
    project_slug="projectSlug",
    signal_ids=[
        "signalIds"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `SignalsLifecycleBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">mute</a>(...) -> SignalsLifecycleResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Silences notifications for each signal in `signalIds`. Muted signals keep tracking occurrences and opening incidents; only notifications stop.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.mute(
    project_slug="projectSlug",
    signal_ids=[
        "signalIds"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `SignalsLifecycleBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">unmute</a>(...) -> SignalsLifecycleResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Re-enables notifications for each signal in `signalIds`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.unmute(
    project_slug="projectSlug",
    signal_ids=[
        "signalIds"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `SignalsLifecycleBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">monitor</a>(...) -> MonitorSignalResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Starts (or realigns) monitoring for the signal. When the signal has no active evaluation, a new one is generated. When an active evaluation exists, the call realigns it. The work runs asynchronously and the response returns immediately. Returns 400 when monitoring is already in progress for this signal.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.monitor(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">unmonitor</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Stops monitoring the signal. Idempotent — signals that aren't being monitored return 204 without changing anything.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.unmonitor(
    project_slug="projectSlug",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.signals.<a href="src/latitude_sdk/signals/client.py">export</a>(...) -> ExportSignalsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Enqueues an asynchronous CSV export. The response returns immediately; the download link is emailed to `recipient` when the file is ready. The recipient must be a member of the requesting organization.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.signals.export(
    project_slug="projectSlug",
    recipient="recipient",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**recipient:** `str` — Email address the download link is sent to. Must belong to a member of the requesting organization.
    
</dd>
</dl>

<dl>
<dd>

**signal_ids:** `typing.Optional[typing.List[str]]` — Restrict the export to this subset of signals. Omit to export every signal in the project.
    
</dd>
</dl>

<dl>
<dd>

**lifecycle_group:** `typing.Optional[ExportSignalsBodyLifecycleGroup]` — `"active"` for unmuted signals; `"archived"` for muted signals. Omit to include both.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Incidents
<details><summary><code>client.incidents.<a href="src/latitude_sdk/incidents/client.py">list</a>(...) -> ListIncidentsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns incidents in the project, ordered from oldest to newest. The time window defaults to the trailing 7 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.incidents.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time window. Returns incidents whose lifetime overlaps `[fromIso, toIso]`. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time window. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**source_type:** `typing.Optional[ListIncidentsRequestSourceType]` — Restrict to incidents triggered by this source type: `monitor` or `signal`.
    
</dd>
</dl>

<dl>
<dd>

**source_id:** `typing.Optional[str]` — Restrict to incidents tied to one source entity id.
    
</dd>
</dl>

<dl>
<dd>

**severities:** `typing.Optional[typing.Union[ListIncidentsRequestSeveritiesItem, typing.Sequence[ListIncidentsRequestSeveritiesItem]]]` — Restrict to incidents whose severity matches any value in this list.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.incidents.<a href="src/latitude_sdk/incidents/client.py">resolve</a>(...) -> Incident</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Resolves (closes) an ongoing incident. An already-closed incident is returned unchanged. If the incident's condition triggers again, a new incident will be opened.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.incidents.resolve(
    project_slug="projectSlug",
    incident_id="incidentId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**incident_id:** `str` — Incident identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Datasets
<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">list</a>(...) -> PaginatedDatasets</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of datasets in the project.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListDatasetsRequestSortBy]` — Field to sort by. Defaults to `updatedAt`.
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListDatasetsRequestSortDirection]` — Sort direction. Defaults to `desc`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">create</a>(...) -> Dataset</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates an empty dataset in the project. The slug is derived from `name`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.create(
    project_slug="projectSlug",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — Human-readable name. Used to derive the slug.
    
</dd>
</dl>

<dl>
<dd>

**description:** `typing.Optional[str]` — Free-form description. Defaults to `null` when omitted or empty.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">get</a>(...) -> Dataset</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns one dataset by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.get(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">delete</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a dataset by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.delete(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">update</a>(...) -> Dataset</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Updates a dataset's `name` and/or `description`. Renaming regenerates the slug — clients should re-read the response or rely on the `id` for stable references.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.update(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` — New human-readable name. Renaming regenerates the slug.
    
</dd>
</dl>

<dl>
<dd>

**description:** `typing.Optional[str]` — New description. Pass `null` to clear; omit to keep the current value.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">list_rows</a>(...) -> PaginatedDatasetRows</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of rows.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.list_rows(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**search:** `typing.Optional[str]` — Free-text search against row cells.
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListRowsDatasetsRequestSortDirection]` — Sort direction on `createdAt`. Defaults to `desc` (newest first).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">insert_rows</a>(...) -> InsertDatasetRowsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Appends one or more rows to the dataset.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment
from latitude_sdk.datasets import InsertDatasetRowsBodyRowsItem

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.insert_rows(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    rows=[
        InsertDatasetRowsBodyRowsItem()
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**rows:** `typing.List[InsertDatasetRowsBodyRowsItem]` — Rows to insert.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">delete_rows</a>(...) -> DeleteDatasetRowsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes rows matching the supplied selection.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment
from latitude_sdk.datasets import DeleteDatasetRowsBodySelection_Selected

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.delete_rows(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    selection=DeleteDatasetRowsBodySelection_Selected(
        row_ids=[
            "rowIds"
        ],
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**selection:** `DeleteDatasetRowsBodySelection` — Rows to delete.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">update_row</a>(...) -> UpdateDatasetRowResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Partially updates a single row. Only the cells you send are changed; omitted cells keep their current value. Use this to fill in an `expectedOutput` (or any other cell) after rows were imported. Bumps the dataset version.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.update_row(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    row_id="rowId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**row_id:** `str` — Stable row identifier (from `listDatasetRows`).
    
</dd>
</dl>

<dl>
<dd>

**input:** `typing.Optional[UpdateDatasetRowBodyInput]` — New input cell. Omit to leave it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**output:** `typing.Optional[UpdateDatasetRowBodyOutput]` — New output cell. Omit to leave it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**expected_output:** `typing.Optional[UpdateDatasetRowBodyExpectedOutput]` — New correct answer for this row. Filled in by curators; usually distinct from `output`. Omit to leave it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `typing.Optional[UpdateDatasetRowBodyMetadata]` — New metadata cell. Omit to leave it unchanged.
    
</dd>
</dl>

<dl>
<dd>

**custom:** `typing.Optional[typing.Dict[str, typing.Optional[UpdateDatasetRowBodyCustomValue]]]` — Custom column values to set, keyed by column identifier. Merged onto the row's existing custom values — columns you omit are left unchanged. Unknown or removed columns are rejected.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">import_rows_from_traces</a>(...) -> ImportRowsFromTracesResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Imports one row per trace matched by `traces`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment
from latitude_sdk.datasets import ImportRowsFromTracesBodyTraces_Ids

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.import_rows_from_traces(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    traces=ImportRowsFromTracesBodyTraces_Ids(
        ids=[
            "ids"
        ],
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**traces:** `ImportRowsFromTracesBodyTraces` — Which traces to import as rows — either explicit ids or a filter set.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">export_rows</a>(...) -> ExportDatasetRowsReadyResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Exports the selected rows as CSV. Returns one of three outcomes, discriminated by `status`:

- `"ready"` — the export fit in the synchronous path. Body carries a short-lived signed `downloadUrl` the caller follows with a plain HTTP GET.
- `"queued"` — the export was too large for the synchronous path AND a `recipient` was supplied. The CSV will be emailed to that address. The recipient must be a member of the requesting organization.
- `"too_large"` — the export was too large for the synchronous path AND no `recipient` was supplied. Body includes a `recommendedAction` describing how to recover (typically: ask the user for an email and retry with `recipient` set).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.export_rows(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**selection:** `typing.Optional[ExportDatasetRowsBodySelection]` — Rows to export. Defaults to `{ mode: "all" }` when omitted.
    
</dd>
</dl>

<dl>
<dd>

**recipient:** `typing.Optional[str]` — Email address to send the download link to when the export is too large for the synchronous path. Must belong to a member of the requesting organization. Ignored when the export fits the synchronous path; required for the async email flow.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">list_columns</a>(...) -> DatasetColumnsList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the ordered active column schema — the built-in columns plus any custom columns. Pass `includeRemoved=true` to also return soft-removed columns (so they can be restored).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.list_columns(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**include_removed:** `typing.Optional[ListColumnsDatasetsRequestIncludeRemoved]` — When `true`, also returns soft-removed columns (each carrying `removed: true`). Defaults to `false`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">add_column</a>(...) -> DatasetColumn</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Adds a custom column. The column starts empty on every row; rows are written only when a cell is filled, so the dataset version does not change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.add_column(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — Display name for the new custom column.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">delete_column</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes a column (built-in or custom) from the active schema. Its data is preserved and the column can be re-added; this does not change the dataset version.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.delete_column(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    identifier="identifier",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**identifier:** `str` — Stable column identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">update_column</a>(...) -> DatasetColumn</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Renames a column. Works for both built-in and custom columns.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.update_column(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    identifier="identifier",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**identifier:** `str` — Stable column identifier.
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — New display name. Works for both built-in and custom columns.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">reorder_columns</a>(...) -> DatasetColumnsList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sets the left-to-right order of columns. This is a metadata edit and does not change the dataset version.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.reorder_columns(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    order=[
        "order"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**order:** `typing.List[str]` — Column identifiers in the desired left-to-right order. Identifiers omitted from the list keep their relative order at the end; unknown identifiers are ignored.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.datasets.<a href="src/latitude_sdk/datasets/client.py">restore_column</a>(...) -> DatasetColumn</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Restores a soft-removed column (built-in or custom) to the active schema, reconnecting its preserved data. Find removed identifiers via `listDatasetColumns` with `includeRemoved=true`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.datasets.restore_column(
    project_slug="projectSlug",
    dataset_slug="datasetSlug",
    identifier="identifier",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**dataset_slug:** `str` — Dataset slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**identifier:** `str` — Stable column identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## ApiKeys
<details><summary><code>client.api_keys.<a href="src/latitude_sdk/api_keys/client.py">list</a>() -> ApiKeyList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns all API keys for the organization. Tokens are not included in the list response.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.api_keys.list()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.api_keys.<a href="src/latitude_sdk/api_keys/client.py">create</a>(...) -> ApiKey</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Generates a new API key for the organization. The token is only returned once — store it securely.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.api_keys.create(
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `str` — Human-readable name for the API key. Used to distinguish keys in the UI.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.api_keys.<a href="src/latitude_sdk/api_keys/client.py">get</a>(...) -> ApiKey</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single API key including the full unmasked `token`. Useful for retrieving a stored token by id without rotating it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.api_keys.get(
    api_key_id="apiKeyId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**api_key_id:** `str` — API-key identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.api_keys.<a href="src/latitude_sdk/api_keys/client.py">revoke</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Revokes an API key.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.api_keys.revoke(
    api_key_id="apiKeyId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**api_key_id:** `str` — API-key identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.api_keys.<a href="src/latitude_sdk/api_keys/client.py">update</a>(...) -> ApiKey</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Renames an API key. The token itself is immutable — use create + revoke if you need a new value.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.api_keys.update(
    api_key_id="apiKeyId",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**api_key_id:** `str` — API-key identifier.
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — New human-readable name for the API key.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## OauthKeys
<details><summary><code>client.oauth_keys.<a href="src/latitude_sdk/oauth_keys/client.py">list</a>() -> OAuthKeyList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns every OAuth key (like MCP clients) connected to the organization.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.oauth_keys.list()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.oauth_keys.<a href="src/latitude_sdk/oauth_keys/client.py">get</a>(...) -> OAuthKey</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single OAuth key (like MCP clients) by id.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.oauth_keys.get(
    oauth_key_id="oauthKeyId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**oauth_key_id:** `str` — OAuth key identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.oauth_keys.<a href="src/latitude_sdk/oauth_keys/client.py">revoke</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Revokes an OAuth key (like MCP clients). The connected client immediately loses access.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.oauth_keys.revoke(
    oauth_key_id="oauthKeyId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**oauth_key_id:** `str` — OAuth key identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Members
<details><summary><code>client.members.<a href="src/latitude_sdk/members/client.py">list</a>() -> MemberList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns every active member of the caller's organization with their role and user details.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.members.list()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.members.<a href="src/latitude_sdk/members/client.py">invite</a>(...) -> InvitedMember</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Signals an invitation to join the caller's organization. The invitee receives an accept link by email and becomes a member once they accept. The response is the pending invitation record. Requires OAuth authentication (API-key callers can't act on behalf of a specific user).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.members.invite(
    email="email",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `str` — Email address to invite. The invitee receives an accept link by email.
    
</dd>
</dl>

<dl>
<dd>

**role:** `typing.Optional[InviteMemberBodyRole]` — Role to grant on acceptance. Defaults to `member` when omitted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.members.<a href="src/latitude_sdk/members/client.py">get</a>(...) -> ActiveMember</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single member of the caller's organization, including their role and user details.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.members.get(
    member_id="memberId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**member_id:** `str` — Membership identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.members.<a href="src/latitude_sdk/members/client.py">remove</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes a member from the caller's organization. Self-removal and removing the organization owner are rejected — transfer ownership first. Requires OAuth authentication.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.members.remove(
    member_id="memberId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**member_id:** `str` — Membership identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.members.<a href="src/latitude_sdk/members/client.py">update</a>(...) -> ActiveMember</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Updates a member of the caller's organization. Today only the role is mutable. The caller must be an admin or owner; owners cannot be demoted via this endpoint. Requires OAuth authentication.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.members.update(
    member_id="memberId",
    role="admin",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**member_id:** `str` — Membership identifier.
    
</dd>
</dl>

<dl>
<dd>

**role:** `UpdateMemberRoleBodyRole` — New role. Owners cannot be changed via this endpoint — owner-transfer happens on the web.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Monitors
<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">list</a>(...) -> PaginatedMonitors</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the project's monitors, system monitors first, then by most recent activity.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 100.
    
</dd>
</dl>

<dl>
<dd>

**search:** `typing.Optional[str]` — Filter by name (case-insensitive substring).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">create</a>(...) -> Monitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a monitor with one rule. The slug is derived from `name`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient, CreateMonitorBody_Match, CreateMonitorBodyMatchTarget
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.create(
    project_slug="projectSlug",
    request=CreateMonitorBody_Match(
        name="name",
        target=CreateMonitorBodyMatchTarget(
            type="savedSearch",
        ),
        severity="low",
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `CreateMonitorBody` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">list_for_target</a>(...) -> MonitorList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns live monitors matching the supplied target type and/or filter subset.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient, FilterCondition
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.list_for_target(
    project_slug="projectSlug",
    filter_set_contains={
        "key": [
            FilterCondition(
                op="eq",
                value="value",
            )
        ]
    },
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**filter_set_contains:** `typing.Dict[str, typing.List[FilterCondition]]` — Filter subset to match against monitor targets. For one user use `userId`; for one tool use `operation = execute_tool` and `toolName`.
    
</dd>
</dl>

<dl>
<dd>

**target_type:** `typing.Optional[ListMonitorsForTargetBodyTargetType]` — Optional target type to match.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">get</a>(...) -> Monitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single monitor by slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.get(
    project_slug="projectSlug",
    monitor_slug="monitorSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**monitor_slug:** `str` — Monitor slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">delete</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a monitor. System monitors cannot be deleted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.delete(
    project_slug="projectSlug",
    monitor_slug="monitorSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**monitor_slug:** `str` — Monitor slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">update</a>(...) -> Monitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Updates a monitor's metadata and incident severity. Target, trigger, metric, and conditions are fixed after creation. System monitor edits are restricted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.update(
    project_slug="projectSlug",
    monitor_slug="monitorSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**monitor_slug:** `str` — Monitor slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` — New name. Renaming may regenerate the slug — re-read the response or rely on `id`.
    
</dd>
</dl>

<dl>
<dd>

**description:** `typing.Optional[str]` — New description.
    
</dd>
</dl>

<dl>
<dd>

**severity:** `typing.Optional[UpdateMonitorBodySeverity]` — Replacement incident severity.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">list_incidents</a>(...) -> PaginatedMonitorIncidents</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the incidents opened by a monitor, most recent first. Each item's `notified` flag shows whether it triggered a notification.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.list_incidents(
    project_slug="projectSlug",
    monitor_slug="monitorSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**monitor_slug:** `str` — Monitor slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 100.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">mute</a>(...) -> Monitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Mutes a monitor so its incidents stop sending notifications. Allowed on all monitors.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.mute(
    project_slug="projectSlug",
    monitor_slug="monitorSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**monitor_slug:** `str` — Monitor slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="src/latitude_sdk/monitors/client.py">unmute</a>(...) -> Monitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Lifts a monitor's mute so its incidents notify again.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.monitors.unmute(
    project_slug="projectSlug",
    monitor_slug="monitorSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**monitor_slug:** `str` — Monitor slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Analytics
<details><summary><code>client.analytics.<a href="src/latitude_sdk/analytics/client.py">query</a>(...) -> AnalyticsSeries</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Compute a metric over a filtered stream (`traces`/`sessions`/`spans`), optionally broken down by a dimension and/or bucketed over time. Returns a tidy series — one point per breakdown value and/or time bucket — suitable for charts and dashboards.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient, AnalyticsQuery_Traces, AnalyticsQueryTracesMetric_Count, AnalyticsQueryTracesRange
from latitude_sdk.environment import LatitudeClientEnvironment
import datetime

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.analytics.query(
    project_slug="projectSlug",
    request=AnalyticsQuery_Traces(
        metric=AnalyticsQueryTracesMetric_Count(),
        range=AnalyticsQueryTracesRange(
            from_iso=datetime.datetime.fromisoformat("2026-06-23T00:00:00+00:00"),
            to_iso=datetime.datetime.fromisoformat("2026-06-30T00:00:00+00:00"),
        ),
    ),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**request:** `AnalyticsQuery` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Spans
<details><summary><code>client.spans.<a href="src/latitude_sdk/spans/client.py">query</a>(...) -> QuerySpans</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of spans across all traces in the project matching `filters` (and an optional time `range`). The span-grain, row-level complement to `queryAnalytics` with `stream: "spans"` (which returns aggregates): use this to drill from an aggregate into the individual spans behind it — e.g. every failing `search_docs` tool span, or the slowest embedding calls.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.spans.query(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[typing.Dict[str, typing.List[FilterCondition]]]` — Row-local span filter set (same DSL as `listTraces`) over span fields — `operation`, `toolName`, `model`, `provider`, `sessionId`, `traceId`, `tags`, `status` (`error`/`ok`/`unset`), `duration`, `cost`, `tokensInput`/`tokensOutput`. `gtePercentile` is not supported — use absolute thresholds or a percentile metric.
    
</dd>
</dl>

<dl>
<dd>

**order_by:** `typing.Optional[QuerySpansBodyOrderBy]` — Sort order. Defaults to newest first (`startTime` desc); use `duration`/`cost` desc for top-N slowest/costliest.
    
</dd>
</dl>

<dl>
<dd>

**range:** `typing.Optional[QuerySpansBodyRange]` — Restrict to spans whose `startTime` falls in this window.
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor from a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Experiments
<details><summary><code>client.experiments.<a href="src/latitude_sdk/experiments/client.py">list</a>(...) -> PaginatedExperiments</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the project's experiments with cheap summary metrics (variant count, distinct sessions and users across all variant populations). Excludes per-variant comparison metrics — fetch a single experiment for those.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.experiments.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 100.
    
</dd>
</dl>

<dl>
<dd>

**search:** `typing.Optional[str]` — Filter by name (case-insensitive substring).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.experiments.<a href="src/latitude_sdk/experiments/client.py">create</a>(...) -> Experiment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates an experiment. The slug is derived from `name`. Omit `variants` to seed two defaults.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.experiments.create(
    project_slug="projectSlug",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` — Human-readable name. Used to derive the slug.
    
</dd>
</dl>

<dl>
<dd>

**description:** `typing.Optional[str]` — Optional free-form description.
    
</dd>
</dl>

<dl>
<dd>

**variants:** `typing.Optional[typing.List[CreateExperimentBodyVariantsItem]]` — Variant definitions. Omit to seed two default variants (`Variant A` baseline + `Variant B`); pass `[]` to create an empty experiment.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.experiments.<a href="src/latitude_sdk/experiments/client.py">get</a>(...) -> ExperimentComparison</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single experiment plus its comparison: per-variant metrics, deltas vs the baseline, and population-deviation flags.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.experiments.get(
    project_slug="projectSlug",
    experiment_slug="experimentSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**experiment_slug:** `str` — Experiment slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.experiments.<a href="src/latitude_sdk/experiments/client.py">update</a>(...) -> Experiment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replaces an experiment's mutable fields. `variants`, when supplied, fully replaces the array (each variant carries its own `baseline` flag). Renaming may regenerate the slug.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.experiments.update(
    project_slug="projectSlug",
    experiment_slug="experimentSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**experiment_slug:** `str` — Experiment slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` — New name. Renaming may regenerate the slug — re-read the response or rely on `id`.
    
</dd>
</dl>

<dl>
<dd>

**description:** `typing.Optional[str]` — New description.
    
</dd>
</dl>

<dl>
<dd>

**variants:** `typing.Optional[typing.List[UpdateExperimentBodyVariantsItem]]` — Full replacement of the variants array. Each variant carries its own `baseline` flag.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.experiments.<a href="src/latitude_sdk/experiments/client.py">delete</a>(...)</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes an experiment. Its slug becomes reusable.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.experiments.delete(
    project_slug="projectSlug",
    experiment_slug="experimentSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**experiment_slug:** `str` — Experiment slug (human-readable identifier within the project).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sessions
<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">list</a>(...) -> PaginatedSessions</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of sessions in the project. A session groups the traces of one conversation. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Session list rows exclude per-message LLM content — use `getSession` for the conversation view.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.list(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListSessionsBodySortBy]` — Field to sort by. Defaults to `lastActivity` (most recently active first).
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListSessionsBodySortDirection]` — Sort direction. Defaults to `desc` (most recent first).
    
</dd>
</dl>

<dl>
<dd>

**query:** `typing.Optional[str]` — Free-text semantic search across the sessions' traces (input and output messages). Combined with `filters` via AND.
    
</dd>
</dl>

<dl>
<dd>

**filters:** `typing.Optional[SessionFilterSet]` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">analytics</a>(...) -> SessionAnalyticsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns session analytics for the project: a total (or median) per metric over the requested range, plus a per-bucket series for each metric. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.analytics(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**from_iso:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`.
    
</dd>
</dl>

<dl>
<dd>

**to_iso:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the time range. Defaults to now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">get</a>(...) -> SessionDetail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a single session by id, including its `conversation`: the system instructions and the messages of the session's latest LLM completion, in OpenTelemetry GenAI format.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.get(
    project_slug="projectSlug",
    session_id="sessionId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**session_id:** `str` — Session identifier lifted from instrumentation. Up to 128 characters.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">list_traces</a>(...) -> PaginatedTraces</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of the traces that belong to the session. Rows match the trace list shape and exclude per-message LLM content — use `getTrace` for the full conversation view.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.list_traces(
    project_slug="projectSlug",
    session_id="sessionId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**session_id:** `str` — Session identifier lifted from instrumentation. Up to 128 characters.
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**sort_by:** `typing.Optional[ListTracesSessionsRequestSortBy]` — Field to sort by. Defaults to `startTime`.
    
</dd>
</dl>

<dl>
<dd>

**sort_direction:** `typing.Optional[ListTracesSessionsRequestSortDirection]` — Sort direction. Defaults to `desc` (most recent first).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">list_signals</a>(...) -> SessionSignals</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the signals that occurred in the session, with occurrence stats scoped to the session's traces. Ordered by most recent occurrence first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.list_signals(
    project_slug="projectSlug",
    session_id="sessionId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**session_id:** `str` — Session identifier lifted from instrumentation. Up to 128 characters.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">get_signal</a>(...) -> SessionSignal</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns one signal by slug, with occurrence stats scoped to the session. Returns 404 when the signal has no occurrences in the session.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.get_signal(
    project_slug="projectSlug",
    session_id="sessionId",
    signal_slug="signalSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**session_id:** `str` — Session identifier lifted from instrumentation. Up to 128 characters.
    
</dd>
</dl>

<dl>
<dd>

**signal_slug:** `str` — Signal slug.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">get_memory</a>(...) -> SessionMemorySummary</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the session's memory footprint: per-record read, added, and removed token metrics plus session-wide totals. Pass `traceId` to restrict the footprint to a single trace of the session.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.get_memory(
    project_slug="projectSlug",
    session_id="sessionId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**session_id:** `str` — Session identifier lifted from instrumentation. Up to 128 characters.
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `typing.Optional[str]` — Restrict the memory footprint to this trace of the session. Omit for the whole session.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sessions.<a href="src/latitude_sdk/sessions/client.py">get_memory_changes</a>(...) -> SessionMemoryChanges</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the memory writes the session made as per-record before/after diffs. Pass `traceId` to restrict to a single trace of the session.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.sessions.get_memory_changes(
    project_slug="projectSlug",
    session_id="sessionId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**session_id:** `str` — Session identifier lifted from instrumentation. Up to 128 characters.
    
</dd>
</dl>

<dl>
<dd>

**trace_id:** `typing.Optional[str]` — Restrict the memory changes to this trace of the session. Omit for the whole session.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Memory
<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">list_stores</a>(...) -> PaginatedMemoryStores</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a cursor-paginated page of the project's memory stores, one roll-up row each (record count, tokens, last-updated, sessions, users). A store groups records under `gen_ai.memory.store.id`; the empty-string store is the unattributed bucket.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.list_stores(
    project_slug="projectSlug",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**cursor:** `typing.Optional[str]` — Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Page size. Defaults to 50; max 200.
    
</dd>
</dl>

<dl>
<dd>

**sort:** `typing.Optional[ListStoresMemoryRequestSort]` — Field to sort by. Defaults to `lastUpdated` (most recently written first).
    
</dd>
</dl>

<dl>
<dd>

**direction:** `typing.Optional[ListStoresMemoryRequestDirection]` — Sort direction. Defaults to `desc`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">get_store</a>(...) -> MemoryStoreSnapshot</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the store's current records (ids, token counts, last-updated) as a snapshot. Pass `at` (ISO-8601) to reconstruct the store as of a past point in time. Record bodies are fetched separately, one record at a time.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.get_store(
    project_slug="projectSlug",
    store_id="storeId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**at:** `typing.Optional[datetime.datetime]` — Reconstruct the store as of this ISO-8601 timestamp. Defaults to the current state.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">get_store_diff</a>(...) -> MemoryStoreDiff</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns a per-record diff of the store between two points in time — added, updated, and removed records with token deltas. `from` defaults to the empty state (everything counts as added); `to` defaults to the current state. Unchanged records are pruned.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.get_store_diff(
    project_slug="projectSlug",
    store_id="storeId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**from:** `typing.Optional[datetime.datetime]` — Lower bound (inclusive) of the diff, ISO-8601. Defaults to the empty state.
    
</dd>
</dl>

<dl>
<dd>

**to:** `typing.Optional[datetime.datetime]` — Upper bound (inclusive) of the diff, ISO-8601. Defaults to the current state.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">list_store_users</a>(...) -> MemoryStoreUsers</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the end-users who accessed the store (reads and writes both count as access), most recent access first. Capped at the 1000 most recent accessors.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.list_store_users(
    project_slug="projectSlug",
    store_id="storeId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">get_record</a>(...) -> MemoryRecordDetail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns one record's current body plus its mutating version history (newest first), each version carrying the authoring span/trace/session/user and per-version token deltas.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.get_record(
    project_slug="projectSlug",
    store_id="storeId",
    record_id="recordId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**record_id:** `str` — Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">get_record_change</a>(...) -> MemoryRecordChangeDiff</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the before/after bodies for one change — the version authored by `spanId` against its predecessor in the record's mutating chain. Returns 404 when the span is not a recorded change of the record.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.get_record_change(
    project_slug="projectSlug",
    store_id="storeId",
    record_id="recordId",
    span_id="spanId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**record_id:** `str` — Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record.
    
</dd>
</dl>

<dl>
<dd>

**span_id:** `str` — Span that authored the change (the `after` side).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">list_record_reads</a>(...) -> MemoryRecordReads</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the retrieval (`search_memory`) events for one record, newest first and capped, each with the query text (when captured), tokens returned, and the accessing span/trace/session/user.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.list_record_reads(
    project_slug="projectSlug",
    store_id="storeId",
    record_id="recordId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**record_id:** `str` — Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Maximum number of read events to return. Capped at 200.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.memory.<a href="src/latitude_sdk/memory/client.py">list_record_users</a>(...) -> MemoryRecordUsers</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the end-users who accessed one record with per-user read and write counts, most recent access first. Capped at the 1000 most recent accessors.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from latitude_sdk import LatitudeClient
from latitude_sdk.environment import LatitudeClientEnvironment

client = LatitudeClient(
    api_key="<token>",
    environment=LatitudeClientEnvironment.PRODUCTION,
)

client.memory.list_record_users(
    project_slug="projectSlug",
    store_id="storeId",
    record_id="recordId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**project_slug:** `str` — Project slug (human-readable identifier)
    
</dd>
</dl>

<dl>
<dd>

**store_id:** `str` — Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.
    
</dd>
</dl>

<dl>
<dd>

**record_id:** `str` — Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

