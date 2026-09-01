# Cross-harness trace correlation

One agent run often spans several harnesses: a Hermes turn calls a tool that launches Claude Code, which in turn spawns subagents. Each harness emits its own OTLP spans from its own process. Without a shared context those become unrelated traces that happen to share a session id, which shows *that* both ran but never that one launched the other.

The contract below makes the causal edge explicit, and it is deliberately harness-agnostic — Codex, OpenCode, a subprocess agent or a remote worker join the same way.

## The contract

> If a harness receives a valid W3C `traceparent`, it joins that trace and parents its root span on the supplied span id. Otherwise it starts a trace of its own. If `LATITUDE_SESSION_ID` is present, it also reports that session id.

Four variables carry it:

| Variable | Meaning |
| --- | --- |
| `TRACEPARENT` | W3C Trace Context header: `00-<trace id>-<parent span id>-<flags>`. The standard, and the primary input. |
| `LATITUDE_TRACEPARENT` | Same format, higher precedence. Lets a repo that already sets `TRACEPARENT` for an unrelated pipeline opt a harness in or out without disturbing it. Precedence is by **presence**: setting it empty is how you opt out of a `TRACEPARENT` that is already there. |
| `LATITUDE_SESSION_ID` | The Latitude session both harnesses report, so they group in the session view as well as the trace. Read **independently of the trace**: a harness that never joins, or stops joining at the cap, still reports it. |
| `LATITUDE_PROJECT` | Project routing. **Not optional decoration:** ingest is project-scoped, so a child that ships to a different project splits the trace in two with no error raised anywhere. |

Parsing follows the W3C rules: version `ff` is rejected, an all-zero trace or span id is rejected, version `00` must have exactly four fields, and a higher version's trailing fields are ignored rather than treated as invalid. Anything malformed is ignored — a bad header makes a harness a root, never a failure.

## Shape of the result

```
Hermes trace
└── interaction (turn)
     └── tool_call:launch_coding_agent      ← the causal boundary
          └── interaction (Claude Code turn)
               ├── llm_request
               └── tool:*
```

The child anchors on the **tool span**, not the turn span. That is what distinguishes "this Claude Code session was launched by that specific tool call" from "both ran during the same turn".

## Producing the context (Hermes)

The plugin is a passive hook observer — it never spawns a process itself — so it publishes the active context two ways:

```python
from latitude_telemetry_hermes import child_env, current_traceparent

subprocess.run(["claude", "-p", goal], env=child_env())
```

`child_env()` returns the current environment plus the four variables, anchored on the tool span currently executing. `current_traceparent()` returns just the header. Both read a `ContextVar` set for the duration of a tool call, so they are correct under Hermes's per-turn worker threads.

Setting `LATITUDE_HERMES_EXPORT_TRACEPARENT=1` additionally scopes those variables onto `os.environ` around each tool call, so *any* subprocess inherits them with no code change. It is **off by default**: `os.environ` is process-wide while Hermes runs each turn on its own thread. The export is therefore owned by one tool call at a time — a concurrent call is skipped rather than allowed to overwrite a sibling's variables and restore them to the wrong values — so under concurrency some children get no context at all. Prefer `child_env()` wherever the tool can pass an environment.

## Consuming the context

Both emitters read it at startup and fall back to their own id generation when it is absent, so nothing changes for a harness launched on its own.

- **Hermes** (`LATITUDE_HERMES_INHERIT_CONTEXT`, default on) seeds the run's trace and root parent from the environment, and reports the inherited session id while keeping its own under `hermes.session.id`.
- **Claude Code** (`LATITUDE_CLAUDE_CODE_INHERIT_CONTEXT`, default on) joins the inherited trace instead of deriving one from `sessionId:turnNumber`. Its own session id stays under `claude_code.session.id`, and all local state stays keyed on it so a resumed session keeps its transcript offsets.

Both record `latitude.parent.trace_id` and `latitude.parent.span_id` as metadata, which is how a joined trace is identifiable after the fact.

## The child has to emit at all

A harness launching another one always does so non-interactively. For Claude Code that means `claude -p`, where Claude Code exits before spawning an `async` Stop hook — so before this contract could work at all, the emitter had to register a synchronous `SessionEnd` hook as well. See [`claude-code-telemetry.md`](claude-code-telemetry.md). Any other harness we add to this contract needs the same question asked of it: does its exporter actually run when it is driven headlessly?

## Bounds

An inherited trace grows for as long as the child keeps running, and Latitude reloads the whole trace on every late span (`TracesIngested` → debounced per-trace `trace-end`, which calls `loadTraceForTraceEndUseCase`). An all-day interactive session would make that reload an ever-growing read.

So joining is capped. Past the cap each harness reverts to its own traces and stays grouped by the shared session id alone:

- Claude Code: `MAX_INHERITED_SPANS` spans contributed to one inherited trace, tracked in the session state.
- Hermes: `MAX_INHERITED_TURNS` turns joined per process.

## Span id salting

A trace id that is minted per turn is itself a unique salt for the span ids inside it. An inherited one is shared by every turn of the session — and by every sibling process the same parent launched — so the turn number and the harness's **own** session id have to move into the salt. In the Claude Code emitter this matters twice over: a call with no message id falls back to `noid:<index>`, which repeats every turn, so turn 2's first call would otherwise reuse turn 1's span id; and one Hermes run hands every child it launches the same trace id *and* the same `LATITUDE_SESSION_ID`, each starting at turn 1, so two children would otherwise mint the same interaction span id and one would silently replace the other. Claude's own session id is per process, which is what separates them — the reported session id cannot.

That is not a cosmetic collision. `traces_mv` is a per-insert `GROUP BY` with no dedup, so a duplicated span additively inflates `span_count`, tokens and cost — even though the `spans` table is a `ReplacingMergeTree` that would collapse it. See [`claude-code-telemetry.md`](claude-code-telemetry.md) for the emit-once discipline this shares with subagent emission.

Span ids on the owned-trace path are unchanged, which keeps a session that is mid-flight during an emitter upgrade from re-sending spans under new ids.

## Late and out-of-order arrival

A child process routinely ships after the parent turn has closed, and sometimes before it. Traces are not immutable: late spans re-fire the debounced `trace-end` job for that trace id, which recomputes from ClickHouse. `packages/domain/spans/src/otlp/cross-harness-correlation.test.ts` covers both orders producing the same tree.
