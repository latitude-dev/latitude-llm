# Session detail panel

A right-side drawer that opens on session-row click. The panel is **the
traces view for a session** — its primary content is the list of traces
that make up the session, with session-level metadata (status, duration,
TTFT, cost, models, span counts) in a sticky header. Clicking a trace
row slides the session panel out to the left and slides the **trace
panel** (the existing trace detail surface) in from the right. A back
arrow on the trace panel slides the session panel back into view.

The IA tracks the data hierarchy and gives the user a consistent mental
model at every level:

- **Trace panel** — shows the **spans** of one trace (plus the
  conversation rendering, annotations, the existing tab set).
- **Session panel** — shows the **traces** of one session (plus
  session-level rollups: issues, metadata).

The slide transition replaces the earlier draft's "overlay the trace
drawer on top of the session panel" pattern. Only one surface is on
screen at a time. This change is what lets users discover every trace
in a session regardless of whether the originating session row is still
visible in the table behind the drawer — once the panel is open, the
trace list lives inside it.

## Scope

- **In:** the panel UI; a new server fn for session-level header metadata;
  the wiring from the sessions list, the search results, the row
  expansion, and deep links into the panel; the slide transition into
  the trace panel and the back-arrow return; per-row trace summaries in
  the Traces tab.
- **Out:** column additions on `sessions` (`./1-parity-traces-sessions.md`);
  issue dedup query (`./3-session-issue-dedup.md`); the trace detail
  surface itself — the slide-in trace panel reuses the existing trace
  drawer (`<Conversation>`, span tree, annotations) exactly as it
  renders today. There is no merged-stream renderer in this spec.

## Position in the dependency chain

Two foundations exist by the time the panel is built:

| Foundation | What it gives the panel |
|---|---|
| `./1-parity-traces-sessions.md` | Header fields on the session row — `timeToFirstTokenNs`, `rootSpanId`, `rootSpanName`, `retentionDays`, status-derivation inputs, message previews. Also defines `SessionDetail` paralleling `TraceDetail` and `findBySessionId` repo method. |
| `./3-session-issue-dedup.md` | `listSessionIssuesBySessionId({ organizationId, projectId, sessionId })` returning `SessionIssueRow[]`. Drives the Issues tab. |

Lifecycle status (`live` / `idle`) is derived inline at read time from
`now() - max_end_time` (see `0-problems.md`). No PG state table, no cron.

The trace panel that slides in inherits everything the trace drawer
already does — `<Conversation>` primitive, `getTraceDetail`,
`getTraceSearchHighlights`, annotation rendering, scroll-to-first,
`N`/`P` navigation, oversized-part collapsing. We do not duplicate any
of that here; we render the existing component into one of two slots in
the session-drawer surface.

---

## 1. Current state

Today the sessions list has expandable rows (`useExpandedSessionTraces`,
`sessions-view.tsx:80`) that reveal the session's constituent trace rows
inline. There is no panel — clicking a session row only toggles the
expansion. Trace rows in the expansion link out to the trace detail
drawer.

Missing:

- A panel that surfaces session-level metadata (status, duration, TTFT,
  cost, models, trace count) in one place.
- A reading surface that lets the user move between the session's traces
  without losing context.
- A consistent click contract — today, "open the session" and "open a
  trace inside the session" are different gestures with different
  affordances.

After this spec:

- Clicking a session row **always** opens the session panel.
- The panel's session slot shows session metadata in its header and the
  list of constituent traces in its Traces tab (default), plus Issues
  and Metadata tabs.
- Clicking a trace anywhere in the panel slides the trace slot in;
  the back arrow slides the session slot back. The sessions-list row
  expansion still works for table-level browsing but is no longer the
  primary trace navigator.

---

## 2. Slide navigation between session and trace panels

The session panel and the trace panel are two slots of the **same**
right-side drawer surface, not two stacked overlays. The drawer mounts
once; switching slots animates as a horizontal slide (~200ms) tied to
the presence of `traceId` in the URL.

- **One `DetailDrawer`, two slots.** A single `DetailDrawer` mounts
  with persistable width (`drawerStoreKey: "session-detail-drawer-width"`).
  Inside it, a transition container renders either:
  - the **session slot** (`<SessionDetail>`) — header + Traces / Issues /
    Metadata tabs;
  - the **trace slot** (the existing `<TraceDetailDrawer>` body) — the
    full trace surface with its own tabs (Conversation, Spans,
    Annotations, etc.).
- **The URL drives the slot.** `?sessionId=…` (no `traceId`) → session
  slot. `?sessionId=…&traceId=…` → trace slot. The trace's row in the
  Traces tab stays highlighted while the trace slot is on screen so
  the user has a visual anchor when they come back.
- **Back arrow on the trace slot** clears `traceId` and slides the
  session slot back in. `Esc` from the trace slot also goes back one
  level (it does **not** close the drawer). Closing the drawer
  entirely requires being on the session slot — `Esc` again, backdrop
  click, or the close button.
- **Sticky header on the session slot** carries title, status pill,
  key chips, copyable id, then the tab bar. Lazy-mounted tabs via
  `visitedTabs` and URL-synced active tab via `useParamState`
  (`urlSyncedTabs={true}`) — same patterns the trace drawer uses today
  at `trace-detail-drawer.tsx:229,:241-247,:378-427`.
- **Discoverable while scrolled.** Because every trace in the session
  is reachable from inside the panel, the user can pick any trace
  regardless of whether the original session row is still visible in
  the table behind the drawer.

What this **replaces** from earlier drafts:

- **No overlay model.** Clicking a trace (or a turn inside a trace)
  does not mount a second drawer over the first. The previous draft
  proposed an overlay pattern mirroring the issue-detail drawer's
  nested trace overlay (`issue-detail-drawer.tsx:655-675`); that
  pattern is replaced by the slide. Only one surface is on screen at
  a time.
- **The sessions-list row expansion is no longer the trace navigator.**
  The Traces tab inside the panel is. The row expansion stays as a
  table-level affordance for users who don't want to open the panel,
  but it's no longer load-bearing for trace-to-trace navigation.

What the session slot does **not** include:

- **No `Spans` tab.** Sessions aren't a single span tree; span-tree
  drill-in lives in the trace slot.
- **No `Conversation` tab.** Conversation rendering belongs to the
  trace slot — the session slot's job is to list traces, not to render
  one of them.

---

## 3. Initial state when the panel opens

The panel always opens. Whether it lands on the **session slot** or
slides immediately into the **trace slot** is decided by the URL on
open:

| Source | URL on open | Initial slot |
|---|---|---|
| Sessions list row click (browse) | `?sessionId=…` | Session slot |
| Sessions-list row expansion → trace click | `?sessionId=…&traceId=<clicked>` | Trace slot (slide animates in once) |
| Search result row click — 1-trace session | `?sessionId=…&traceId=<only>&q=…` | Trace slot |
| Search result row click — multi-trace session | `?sessionId=…&traceId=<first-match>&q=…` | Trace slot |
| Issue row → "View session" link | `?sessionId=…` | Session slot |
| Deep link `?sessionId=…&traceId=…` | (as supplied) | Trace slot |
| Deep link `?sessionId=…` only | (as supplied) | Session slot |
| Deep link where `traceId` is not in `session.traceIds` | (as supplied) | Session slot; URL is rewritten to drop `traceId`; non-fatal warning logged |

When the panel opens directly on the trace slot (search and
expansion-row cases), the slide animation **runs once on open** — the
session slot renders for one frame, then slides out to the left while
the trace slot arrives from the right. This is the same visual cue
the user sees later when they hit back, so the spatial model registers
from the first interaction. We do not skip the animation on
deep-links: the cost is small, and the orientation it gives users
("there's a session behind this trace") is the whole point of the
pattern.

### Highlighting the active trace

While the trace slot is on screen, the corresponding row in the
session slot's Traces tab is marked as **active** (background tint +
left border). When the user slides back, the active row is already
highlighted so they can pick the next trace without reorienting. The
Traces tab also reflects `q` (search highlights / matching-trace
badges) regardless of which slot is on screen, so the moment the user
slides back, they see all the matches without a refetch.

### Search-mode multi-trace navigation

When `q` is non-empty:

- Every matching trace (`matchingTraceIds`) gets a hit-count badge in
  the Traces tab.
- The first matching trace is auto-opened in the trace slot via the
  initial-URL contract above.
- The user advances to the next match by sliding back (session slot)
  and clicking the next badged row. There is no "next match" hotkey
  *across* traces in V1 — within-trace `N`/`P` stepping is the trace
  panel's existing affordance; cross-trace is by clicking.

If telemetry later shows users want a global `N`/`P` that crosses
trace boundaries inside a session, we add it as a session-slot-level
hotkey that slides through matches in order. Park until measured.

---

## 4. Information architecture

### Header

```
┌────────────────────────────────────────────────────────────────────┐
│  My Session · Refund flow                  ●live · 12s ago        │  ← root_span_name + status pill
│  ⏱ 12m 34s · TTFT 1.2s · 7 traces · 142 spans (2 err) · $0.034   │  ← duration / TTFT / counts / cost
│  📋 Copy session id  •  s_x9...3b                                  │  ← copyable id
│  ─── Conversation ───── Issues 3 ──── Metadata ────                │  ← tabs (Conversation default)
└────────────────────────────────────────────────────────────────────┘
```

Fields and their source:

| Element | Source |
|---|---|
| Title | `session.rootSpanName` (parity spec). Falls back to the literal session id when empty. For orphan sessions where `session_id = toString(trace_id)`, falls back to the synthesized id displayed as a short prefix. |
| Status pill (`live` / `idle`) | Derived in `LIST_SELECT`: `now64() - max_end_time < toIntervalMinute({sessionLiveThresholdMinutes})` → `live`, else `idle`. Default threshold = 5 minutes. Color: green dot for `live`, muted for `idle`. Pill text reads "Live · 3m ago" or "Idle · 42m ago". |
| Duration | `formatDuration(session.durationNs)`. **Active execution time** — sum of per-trace durations, not wall-clock. A 2-day session that worked 5 min/day renders as ~2 hours, not ~2 days. See `./1-parity-traces-sessions.md` "On `duration_ns` semantics". If the panel ever wants to also surface the wall-clock window, compute it on the fly as `endTime - startTime` from the same row. |
| TTFT | `formatDuration(session.timeToFirstTokenNs)`; renders "—" when 0 (sentinel = no first-token instrumented). |
| Trace count | `session.traceCount`. |
| Span count + error suffix | `session.spanCount` and `session.errorCount`. |
| Cost | `formatPrice(session.costTotalMicrocents / 100_000_000)`. |
| Copyable session id | `<CopyableText value={sessionId} displayValue={sessionId.slice(0, 7)} />`. |

### Orphan and orphan-fragment rendering

The header degrades naturally for the two adjacent edge cases (see
`./1-parity-traces-sessions.md` "SDK contract and mixed binding"):

| Case | Header rendering |
|---|---|
| **Pure orphan** (`trace_count = 1`, no SDK `session_id`) | Title falls back to the root span name of the only trace; "1 trace" badge instead of "N traces". TTFT / cost may or may not be set depending on whether the trace had LLM activity. |
| **Orphan fragment** (`tokens_total = 0`, `cost_total_microcents = 0`, `models = []`, `trace_count = 1`) | Title reads as the framework-overhead slice of the request. TTFT and cost render "—" / "$0". Sliding into the one trace lands on an empty Conversation (no LLM spans). Metadata tab on the session slot is still populated. |

These rows are filtered out of the default sessions list view by the
"has LLM activity" filter chip (`./4-filter-parity.md`). Users who turn
that filter off can open them; the panel is honest about what's inside.

### Tabs

Three tabs on the session slot. `Traces` is the default visit.

| Tab id | Label | Hotkey | Behavior |
|---|---|---|---|
| `traces` | Traces `<N>` | `Shift+1` | Default open. Lists every trace in the session ordered by `start_time` asc. Click a row → slide into the trace slot. |
| `issues` | Issues `<N>` | `Shift+2` | Lazy-mounted. Pill count from `listSessionIssuesBySessionId().length`. |
| `metadata` | Metadata | `Shift+3` | Lazy-mounted. Header-style detail sections. |

The **Conversation tab** that an earlier draft proposed is removed.
Conversation rendering belongs to the trace slot — the session slot's
job is to list traces and let users pick one. Single-trace sessions
land on the same Traces tab; the row is one-of-one and clicking it
slides into the conversation. No special case for "1 trace" vs
"N traces" at the panel level.

The **Traces tab** that an even earlier draft removed in favor of the
row expansion is back. Putting it in the panel is what makes trace
navigation work without the row expansion being on screen behind the
drawer — see §2 "Discoverable while scrolled".

---

## 5. Traces tab

The default tab on the session slot. Lists every trace in the session,
with enough information per row that users can choose which one to
slide into without guessing.

### Row layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▌ Refund flow · turn 1            ●ok · 12s · $0.004   3 spans     │
│ ▌ Refund flow · turn 2            ●ok ·  9s · $0.003   3 spans     │
│ ▌ Refund flow · turn 3            ⚠ err · 14s · $0.005  4 spans (1 err) │
│ ▌ Refund flow · turn 4 (active)   ●ok ·  7s · $0.002   3 spans     │  ← currently in trace slot
└─────────────────────────────────────────────────────────────────────┘
```

Fields per row come from the existing trace listing select — name,
status, duration, cost, span counts, error count — scoped to
`trace_id IN (session.traceIds)`. The repo already returns `traceIds`
ordered by `start_time` asc (parity spec, `./1-parity-traces-sessions.md`);
the panel issues one bulk fetch on tab mount.

### Click behavior

Clicking a row:

1. Sets the URL to `?sessionId=…&traceId=<row.id>` (and preserves `q`
   if present).
2. Fires `getTraceDetail(row.id)` and `getTraceSearchHighlights(row.id, q)`
   (if `q` is non-empty). Cache keys are per-trace, so previous traces
   stay cached.
3. The drawer transitions: session slot slides left, trace slot slides
   in from the right. The Traces-tab row that was clicked is the
   "active" row when the user later slides back (per §3).

### Search-mode highlights

When `q` is non-empty:

- Matching traces (`matchingTraceIds`) get a hit-count badge.
- The first matching trace is auto-opened in the trace slot via §3.
- Remaining matching traces stay highlighted in the list — the user
  slides back to pick the next one. Hit counts come from the same
  payload the search results already produce; the panel doesn't
  recompute them.

This is the session-result behavior `./5-search-highlights.md`
defines, rendered inside the panel instead of in the row expansion.

### Annotations on traces

Annotations belong to the trace they live in, not to the session. The
session slot does **not** offer annotation creation — that lives in
the trace slot (after the slide). The Traces tab can surface a
per-row **annotation-count badge** so users can spot annotated turns
without sliding in.

The earlier draft's guidance carries over unchanged, just renamed for
the slide model:

- **Annotations attach to the current trace's span, not to the session.**
  An annotation is a statement about a specific moment (a particular
  message produced by a particular span), so the natural anchor is the
  trace it lives in. The session view rolls these up; it doesn't own
  them.
- **Success-toast wording is explicit about anchoring.** When an
  annotation is saved from the trace slot, the toast reads
  "Annotation added to turn N of this session" (rather than the
  standalone trace drawer's "Annotation added"). `N` is the trace's
  position by `start_time` within `session.traceIds`.
- **New traces arriving later do not migrate older annotations.** If
  a user annotates turn 5 and turn 6 later lands in the same session,
  the annotation stays on turn 5. It's discoverable via (a) the
  Issues tab when the annotation became a score with an `issue_id`,
  (b) the annotation-count badge on turn 5's row in the Traces tab.
- **Session-level annotations are explicitly out of scope.** "This
  whole conversation was bad" doesn't have a useful anchor; if a
  specific turn was bad, annotate that turn. We don't add
  `target_kind = 'session'` to `scores`, and we don't build a
  session-grain annotation surface here. If product demand surfaces
  it later, that's a separate feature.

---

## 6. Issues tab

Driven by `listSessionIssuesBySessionId` (`./3-session-issue-dedup.md`).
One row per `(issue_id, session_id)` in the session.

### Row layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔴  Refusal on payment-related turns        4 turns · 2m ago       │
│      Last seen: 14:32 · First seen: 14:20                          │
│      Affected traces: t_a1, t_b2, t_c3, t_d4   [hover to expand]   │
└─────────────────────────────────────────────────────────────────────┘
```

Fields from `SessionIssueRow`:

| Element | Field |
|---|---|
| Title | Joined from PG `issues.name`. |
| Occurrence count | `occurrences` (per `./3-session-issue-dedup.md` — count of contributing scores). |
| First seen / Last seen | `firstSeenAt`, `lastSeenAt`. |
| Affected traces | `matchingTraceIds`. Each trace id is clickable. |

### Click behavior on an affected trace

Clicking an affected trace id (or the issue row itself) is **one user
gesture** that does three things:

1. Sets the URL to `?sessionId=…&traceId=<affected>` (and
   `messageId=<anchor>` if available — the annotated message's id).
2. Slides the trace slot in from the right.
3. Inside the trace slot, the Conversation tab scrolls to the
   anchored message and briefly flashes a highlight on it (reusing
   the `ScrollNavigator`'s target-flash affordance) so the user's eye
   lands on it immediately rather than just "near it."

The user perceives a single response: "I clicked the issue and the
annotated turn is right there." Two design polishes keep that
perception honest:

- **Prefetch on Issues-tab visit.** When the Issues tab is mounted,
  the panel issues `queryClient.prefetchQuery(["traceDetail", traceId])`
  for every unique `traceId` in the loaded
  `SessionIssueRow.matchingTraceIds` arrays. Trace count is bounded by
  the session's `traceCount` (typically <20); each prefetch is one
  `getTraceDetail` call. The slide then runs while the data is already
  hot. Same shape as the search-mode prefetch in
  `./5-search-highlights.md`'s "Per-trace re-highlighting".
- **Targeted post-scroll flash.** After the slide settles and the
  conversation paints, the annotated message gets a short visual
  emphasis (background pulse or ring) tied to `data-annotation-id`.
  Same primitive the trace drawer uses when an annotation hash-link is
  opened. This is the difference between "we landed on the right turn"
  feeling correct vs. feeling sloppy.

Sliding back (back arrow or `Esc`) returns to the Issues tab on the
session slot with the row still selected.

### Why this drilldown doesn't feel heavy

A natural worry with the rollup model is that drilling into an
annotation makes the user traverse "session → trace → conversation →
scroll." The slide model collapses that into one click and one
animation: the user clicks an issue row, the trace slot slides in,
and the annotated message is centered and flashed. There is no
overlay stack to mentally manage; there is one back arrow that
unambiguously returns to where they came from.

If telemetry later shows the transition still feels heavy, the
fallback affordance is a popover-on-issue-row mode: click an issue
row → popover with the annotation text + a secondary "Open in trace"
button. We don't ship that by default; it's a parking spot if the
polished version fails real-use feedback.

### Empty / loading / error states

- Empty (no issues): "No issues detected in this session."
- Loading: skeleton rows.
- Error: "Couldn't load issues — retry." Standard hook error UI.

---

## 7. Metadata tab

Session-level fields, none of which depend on which trace the user
slides into. Read once on tab visit.

### Sections (top to bottom)

1. **Identifiers** —
   - `Session ID` (copyable)
   - `Organization ID`, `Project ID`
   - `Root span ID` (from `session.rootSpanId`, parity spec) — copyable
   - `User ID`, `Simulation ID` if present
2. **Timing** —
   - `Started at` — `session.startTime`.
   - `Last activity` — `session.endTime` (i.e. `max_end_time` from the
     materialization).
   - `Status` — same `live` / `idle` derivation as the header pill.
3. **Volume and cost** —
   - `Total traces`, `Total spans`, `Error spans`
   - `Total tokens` (with breakdown: input, output, cache read/create, reasoning)
   - `Total cost` (with breakdown: input, output)
4. **Models and providers** —
   - `Models used` — `session.models` array
   - `Providers` — `session.providers` array
   - `Service names` — `session.serviceNames` array
5. **Tags and metadata** —
   - `Tags` — `session.tags` array, rendered as chips
   - `Metadata` — `session.metadata` map, key/value table
6. **Retention** —
   - `Retention days` — `session.retentionDays`. Useful for power users
     auditing plan-tier retention.

---

## 8. Server functions

Two are new; the others are reused from existing surfaces.

### `getSessionDetail({ projectId, sessionId })` (new)

Single-session point lookup for the header + metadata tab. No
conversation content (that comes from `getTraceDetail`).

```ts
export const getSessionDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    projectId: z.string(),
    sessionId: z.string(),
  }))
  .handler(async ({ data }): Promise<SessionDetailRecord | null> => { /* ... */ })

export interface SessionDetailRecord extends SessionRecord {
  // From 1-parity-traces-sessions.md
  readonly timeToFirstTokenNs: number
  readonly rootSpanId: string
  readonly rootSpanName: string
  readonly retentionDays: number
  readonly systemInstructions: GenAISystem

  // Derived inline from now() - max_end_time
  readonly status: "live" | "idle"

  // Drives the Traces tab list
  readonly traceIds: readonly string[]      // ordered by start_time asc
}
```

Backed by a new repo method `SessionRepository.findBySessionId({
organizationId, projectId, sessionId })` returning a `SessionDetail`
(parity spec's analog of `TraceDetail`). The repo impl projects through
`DETAIL_SELECT` from
`packages/platform/db-clickhouse/src/repositories/session-repository.ts`,
paralleling `TraceRepository.findByTraceId` at `trace-repository.ts:1613-1643`.

### `getTraceDetail({ projectId, traceId })` (reused)

Existing. Called when the user clicks a trace row in the Traces tab
(slide-in) or on a deep link that lands directly on the trace slot.

### `getTraceSearchHighlights({ projectId, traceId, searchQuery })` (reused)

Existing, introduced by `./5-search-highlights.md`. Called alongside
`getTraceDetail` when `q` is non-empty.

### `listTracesByIds({ projectId, traceIds })` (reused / extended)

The Traces tab needs per-row summaries (name, status, duration, cost,
span counts, error count, annotation count) for every trace in
`session.traceIds`. Reuse the existing trace listing query with an
`IN (?)` filter scoped to the session's traces. If the listing query
doesn't expose an `IN` predicate today, extend it; we don't introduce
a parallel single-purpose query.

### `listSessionIssuesBySessionId({ projectId, sessionId })` (reused)

From `./3-session-issue-dedup.md`. Drives the Issues tab.

---

## 9. Navigation

### Opening the panel

| Source | URL on open | Initial slot |
|---|---|---|
| Sessions list row click | `?sessionId=…` | Session slot |
| Row expansion's trace row click | `?sessionId=…&traceId=<clicked>` | Trace slot (slide animates in once) |
| Search result row click | `?sessionId=…&traceId=<first-match>&q=…` | Trace slot |
| Issue row → "View session" link | `?sessionId=…` | Session slot |
| Issue row → "View affected trace" click | `?sessionId=…&traceId=<affected>&messageId=<anchor>` | Trace slot |
| Deep link | (as supplied) | Decided by presence of `traceId` per §3 |

The URL is the source of truth. Reload restores both the slot and any
within-slot state (active tab, message anchor).

### Between slots

- **Session → Trace**: clicking any trace anywhere in the panel
  (Traces tab row, Issues tab affected trace) sets `traceId` in the
  URL and slides left.
- **Trace → Session**: back arrow on the trace slot or `Esc` clears
  `traceId` and slides right. The Traces tab's active row stays
  highlighted on the way back.

### Closing the drawer

Only from the session slot. `Esc` from the trace slot goes back one
level (to the session slot); a second `Esc` closes the drawer. Backdrop
click and close button always close the drawer regardless of which
slot is on screen. On close, both `sessionId` and `traceId` are cleared.
The sessions-list row expansion stays expanded if it was open (it's an
independent piece of state).

### Co-existence with other surfaces

The drawer can be open simultaneously with:

- The sessions-list row expansion behind the drawer (it's no longer
  the trace navigator, but it persists for users who don't open the
  panel).
- The issue detail drawer (when the user clicks an issue row's "open
  issue" link — out of scope here, but the pattern works because the
  issue drawer is on a different stack).

There is **no** trace-drawer overlay on top of the session drawer.
Trace detail lives in the session drawer's trace slot, not in a
second drawer.

---

## 10. Live updates

- **Status pill** polls `getSessionDetail` every **30 seconds** when
  `status === "live"`. Polling stops when the session becomes `idle`
  or the drawer is closed. Re-uses the existing React Query refetch
  interval pattern.
- **Traces tab** does **not** auto-poll the per-trace summaries. New
  traces in a `live` session are picked up on the next manual reload
  or when the user re-opens the panel. Rationale: rows in a `live`
  session shift in cost / span counts continuously; polling them adds
  flicker without adding clarity. Users who want live-tail are looking
  at the trace, not the session.
- **Trace slot** does not auto-poll. The user reloads manually to
  pick up new turns on the currently-open trace.
- **Issues tab** does not auto-poll. Same reasoning — the panel is
  for reading, not for live-monitoring.

If down the line we want a live-tail experience for the open trace,
that's a feature of the trace panel itself (lives in `<Conversation>`),
behind a separate spec.

---

## 11. Files this will touch

### Domain layer

- `packages/domain/spans/src/entities/session.ts` — already widened by
  parity spec. The panel doesn't add fields beyond what's already there.
- `packages/domain/spans/src/ports/session-repository.ts:12` — add
  `findBySessionId({ organizationId, projectId, sessionId }):
  Effect.Effect<SessionDetail | null, RepositoryError, ChSqlClient>`.
- `packages/domain/sessions/src/use-cases/get-session-detail.ts` (new)
  — composes `findBySessionId`.
- Reuses existing `findByTraceId` (trace drawer's data source) and
  `listSessionIssuesBySessionId` (issue dedup spec).

### Platform layer (CH)

- `packages/platform/db-clickhouse/src/repositories/session-repository.ts`
  — add `findBySessionId` + `DETAIL_SELECT`. Same shape as parity
  spec's "Files that change" — this is its consumer.

### Web layer

- `apps/web/src/domains/sessions/sessions.functions.ts` — add
  `getSessionDetail` server fn.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/session-detail-drawer.tsx`
  (new) — the outer drawer surface. Owns the single `DetailDrawer`,
  the slot-switching transition, and the URL-driven slot selection
  (`sessionId` only → session slot, `sessionId + traceId` → trace
  slot). Mirrors the trace drawer's chrome (header pattern, lazy
  mount, `urlSyncedTabs={true}` for the session slot's tabs).
- `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/session-detail-drawer/`
  — sub-folder for the two slots and the session-slot tabs:
  - `session-slot.tsx` — sticky header + tab bar; renders one of the
    three session-slot tabs.
  - `trace-slot.tsx` — thin wrapper that mounts the existing
    `<TraceDetailDrawer>` body inline (no nested `DetailDrawer`),
    with a back-arrow header that clears `traceId`.
  - `traces-tab.tsx` — list of per-trace summary rows; click → set
    `traceId` and slide.
  - `issues-tab.tsx` — list of `SessionIssueRow`; affected-trace
    click → set `traceId + messageId` and slide.
  - `metadata-tab.tsx` — detail sections.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/session-detail-drawer/slot-transition.tsx`
  (new) — the slide animation between session and trace slots. Single
  responsibility; keep it small enough to swap out if the animation
  library changes.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/sessions/-components/sessions-view.tsx`
  — wire row click to open the panel with `?sessionId=…`.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`
  — wire search-result row click to open the panel with
  `?sessionId=…&traceId=<first-match>&q=…` (this is the entry point
  this epic ships first; the lift into unified `sessions` happens
  later per `0-problems.md`'s future-state UX context).
- `apps/web/src/domains/sessions/sessions.collection.ts` — add
  `useSessionDetail` hook (React Query wrapper).

---

## 12. Open questions

- **"Open in full session conversation view" as a power-user feature.**
  Some users may want to read the whole multi-trace conversation as a
  continuous stream. That's a separate surface — likely a dedicated
  route or full-page mode rather than a slot in the drawer. Park
  until we see whether per-trace navigation via the Traces tab + slide
  meets the need.
- **Pre-fetch traces' details on session-row hover?** Cheap and would
  make the first slide feel instant. Probably worth doing for the
  initial cut. Confirm with telemetry once shipped.
- **Pre-fetch all matching traces' highlights when opening a search
  result?** `matchingTraceIds` is bounded by the session's trace count
  (typically <20). Firing N parallel `getTraceSearchHighlights` calls
  on panel open is bounded work and makes cross-match slides instant.
  Probably worth doing in V1 — flagged so we can measure cost before
  turning it on by default.
- **What animation library for the slide?** Framer Motion is already
  in the bundle for other transitions; using it keeps the dependency
  surface stable. Plain CSS transforms also work and avoid the runtime
  cost. Pick during implementation; the `slot-transition.tsx` boundary
  in §11 keeps this swappable.
- **Cross-trace `N`/`P` hotkey inside a session?** §3 parks it. Decide
  after measuring how often users walk multiple matches in one
  session.
- **Annotation badge on the sessions-list row expansion's trace
  rows.** With the panel now owning trace navigation, the row
  expansion's role shrinks. Whether the expansion still shows
  annotation counts (and per-trace search hit badges) is a
  sessions-list spec concern, not a panel concern.

---

## 13. Tracking

Linear project: [Session first-class support](https://linear.app/latitude/project/session-first-class-support-b15a26fbddb6/overview).

At the time of this revision, the project does **not** have a
dedicated task for the work this spec defines (the session panel + the
slide-navigation pattern between the session and trace slots). New
issue to file: "Session panel with slide-navigation to trace slot
(spec: `specs/session-problems/6-session-panel.md`)". Linked
dependencies: parity (`./1-parity-traces-sessions.md`), issue dedup
(`./3-session-issue-dedup.md`), search highlights
(`./5-search-highlights.md`).

A second open task to file in the same project, unrelated to the
panel: **"Add p99 to the sessions table's Duration column"**. Today
the column shows AVG and p90; we want p99 alongside them so latency
tails are visible in the listing. Scope: investigate the cheapest way
to compute p99 on the sessions materialization (likely via the same
quantile mechanism that produces p90), wire it into the column header
chip ("p90 / p99" toggle or stacked badges), and confirm it doesn't
blow up the existing per-row query budget.
