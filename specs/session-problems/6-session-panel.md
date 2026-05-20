# Session detail panel

A right-side drawer that opens on session-row click. Mirrors the trace
drawer's shape — sticky header, lazy-mounted tabs, the existing
`<Conversation>` primitive — but uses a session-level header (metadata
header, status pill, copyable id) and a Conversation tab that renders
**one trace at a time**. The "which trace" decision is fully owned by
this spec (§3); navigation between traces of the same session lives in
the sessions-list row expansion, not in the panel.

## Scope

- **In:** the panel UI; a new server fn for session-level header metadata;
  the wiring from the sessions list, the search results, the row
  expansion, and deep links into the panel; the four-case trace-selection
  contract (browse / search × 1-trace / multi-trace).
- **Out:** column additions on `sessions` (`./1-parity-traces-sessions.md`);
  issue dedup query (`./3-session-issue-dedup.md`); the trace conversation
  rendering primitive itself — the panel reuses the existing
  `<Conversation>` from `packages/ui/src/components/genai-conversation`
  exactly as the trace drawer does. There is no merged-stream renderer
  in this spec.

## Position in the dependency chain

Two foundations exist by the time the panel is built:

| Foundation | What it gives the panel |
|---|---|
| `./1-parity-traces-sessions.md` | Header fields on the session row — `timeToFirstTokenNs`, `rootSpanId`, `rootSpanName`, `retentionDays`, status-derivation inputs, message previews. Also defines `SessionDetail` paralleling `TraceDetail` and `findBySessionId` repo method. |
| `./3-session-issue-dedup.md` | `listSessionIssuesBySessionId({ organizationId, projectId, sessionId })` returning `SessionIssueRow[]`. Drives the Issues tab. |

Lifecycle status (`live` / `idle`) is derived inline at read time from
`now() - max_end_time` (see `0-problems.md`). No PG state table, no cron.

The Conversation tab inherits everything the trace drawer already does —
`<Conversation>` primitive, `getTraceDetail`, `getTraceSearchHighlights`,
annotation rendering, scroll-to-first, `N`/`P` navigation, oversized-part
collapsing. We do not duplicate any of that here.

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
- The panel shows session metadata in its header and **one trace's
  conversation** in its Conversation tab.
- For multi-trace sessions, the row also expands inline (current
  behavior). The expansion is the trace navigator — clicking a different
  trace row swaps which trace the panel is rendering.

---

## 2. Trace drawer as the template

The session panel mirrors the trace drawer (`trace-detail-drawer.tsx`)
in structure:

- **Right-side `DetailDrawer`** with persistable width
  (`drawerStoreKey: "session-detail-drawer-width"`, sibling of the
  trace-drawer key).
- **Sticky header** with title, status pill, key chips, copyable id,
  then the tab bar.
- **Lazy-mounted tabs** via `visitedTabs`, identical pattern to
  `trace-detail-drawer.tsx:229,:241-247,:378-427`.
- **URL-synced active tab** via `useParamState`
  (`urlSyncedTabs={true}`), so deep links restore which tab the user
  was on. The trace drawer that opens on top of the panel (e.g. when
  the user clicks a turn inside the Conversation tab to drill into the
  trace's full detail view) is mounted with `urlSyncedTabs={false}` to
  keep the parent route's URL clean — same pattern as the issue-detail
  drawer's nested trace overlay (`issues/-components/issue-detail-drawer.tsx:655-675`).

What it does **not** mirror:

- **No `Spans` tab.** Sessions aren't a single span tree. Span-tree
  drill-in is per-trace and reached by opening the trace drawer on top
  of the panel.
- **No `Trace` tab.** Its session-level analog is the **Metadata** tab.
- **No standalone `Traces` tab.** This functionality lives in the
  sessions-list **row expansion**, which is already on screen behind
  the panel. Putting a "Traces" tab in the panel would duplicate the
  expansion's UI.

---

## 3. Which trace does the Conversation tab show?

The panel always renders session metadata + one trace's conversation.
The selection of which trace depends on how the panel was opened:

| Case | Initial `currentTraceId` |
|---|---|
| Browse, 1-trace session (real or orphan) | `trace_ids[0]` — the one trace |
| Browse, multi-trace session | The **last** trace by `start_time` — most recent activity |
| Search, 1-trace session | `trace_ids[0]`, scrolled to first highlight |
| Search, multi-trace session | The **first matching** trace in score order from `matchingTraceIds[0]`, scrolled to first highlight |
| Deep link with `?sessionId=…&traceId=…` | The supplied `traceId` (must be in the session's `trace_ids`) |
| Deep link with `?sessionId=…` only | Last trace by `start_time` |
| Any case where the resolved trace is somehow not in `trace_ids` | Fall back to last trace, log a non-fatal error |

### Multi-trace navigation

For multi-trace sessions, the sessions-list **row expansion** shows
every trace in the session, ordered by `start_time` ascending. When a
search is active, the matching traces from `matchingTraceIds` get a
visual hit-count badge / highlight (per `./5-search-highlights.md`'s
session-result behavior). Clicking a different trace row in that
expansion sets the panel's `currentTraceId` to that trace, which:

1. Re-fires `getTraceDetail(newTraceId)`.
2. Re-fires `getTraceSearchHighlights(newTraceId, q)` if `q` is non-empty.
3. The Conversation tab re-renders with the new content. Scroll position
   resets to the first highlight (if search) or the top (if not).

The expansion **is** the trace navigator. The panel has no internal
trace switcher; if the user wants to read a different trace, they pick
it from the expansion behind/beside the drawer.

### Why "last trace" as the default

For browse-mode multi-trace, the default trace shown when the panel
opens has to be one specific trace. We pick the **last** because:

- Users opening a session for the first time are usually checking
  current state ("what's this conversation up to now?"), not session
  history.
- The last trace is also what `output_messages` / `last_input_messages`
  on the session row preview (per `./1-parity-traces-sessions.md`). Panel
  default matching row preview reduces "wait, why am I seeing this?"
  surprise.
- For 1-trace sessions, "last" and "only" coincide — same code path.

If we later add UX that wants the first trace as default (e.g. "review
this session from the start"), it overrides via deep-link `?traceId=…`.

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
| **Orphan fragment** (`tokens_total = 0`, `cost_total_microcents = 0`, `models = []`, `trace_count = 1`) | Title reads as the framework-overhead slice of the request. TTFT and cost render "—" / "$0". Conversation tab is empty (no LLM spans). Metadata tab is still populated. |

These rows are filtered out of the default sessions list view by the
"has LLM activity" filter chip (`./4-filter-parity.md`). Users who turn
that filter off can open them; the panel is honest about what's inside.

### Tabs

Three tabs. `Conversation` is the default visit.

| Tab id | Label | Hotkey | Behavior |
|---|---|---|---|
| `conversation` | Conversation | `Shift+1` | Default open. Renders `currentTraceId`'s conversation via `<Conversation>`. |
| `issues` | Issues `<N>` | `Shift+2` | Lazy-mounted. Pill count from `listSessionIssuesBySessionId().length`. |
| `metadata` | Metadata | `Shift+3` | Lazy-mounted. Header-style detail sections. |

The **Traces tab** that an earlier draft of this spec proposed is
removed — its job is done by the sessions-list row expansion.

---

## 5. Conversation tab

Renders one trace's conversation. Uses the **exact same primitive** the
trace drawer's Conversation tab uses
(`trace-detail-drawer/tabs/conversation-tab.tsx`). Concretely:

```ts
<ConversationTab
  trace={traceDetail}                         // from getTraceDetail(currentTraceId)
  searchQuery={q}                             // from URL ?q=…
  highlightRanges={searchHighlights}          // from getTraceSearchHighlights(currentTraceId, q)
  onAnnotationClick={…}
  // mounted with the same props the trace drawer uses today
/>
```

The component is reused **as a child** of both the trace drawer and the
session panel; the panel doesn't reimplement any of conversation
rendering. That gets us, for free:

- Annotation rendering and the per-message `messageAnnotationSlot`.
- `<ScrollNavigator>` with `N`/`P` stepping through messages (or
  through highlights when search is active — see `./5-search-highlights.md`).
- The `LARGE_MARKDOWN_CONTENT_THRESHOLD` cap and "Show N more
  characters" affordance.
- The oversized-part offset fix from `./5-search-highlights.md` Phase A.

### What happens when `currentTraceId` changes

`currentTraceId` is the panel's local state. It changes when:

1. The panel first opens (initial value from §3).
2. The user clicks a different trace row in the sessions-list row
   expansion behind the panel.
3. A deep link is loaded with a new `?traceId=…`.

On change:

1. The panel updates `currentTraceId` in URL params
   (`useParamState("traceId", …)`).
2. React Query fires `getTraceDetail(newTraceId)` and
   `getTraceSearchHighlights(newTraceId, q)` if `q` is non-empty. Cache
   keys `["traceDetail", newTraceId]` and
   `["traceSearchHighlights", newTraceId, q]` are independent — the old
   trace's data stays cached.
3. The Conversation tab re-renders. Scroll resets to the first highlight
   (if search) or top (if not).

The Issues tab and Metadata tab do **not** refetch on a trace switch —
they read session-level data which doesn't depend on which trace is
being viewed.

### Click behavior on a turn

Clicking a turn in the Conversation tab opens the **trace detail
drawer overlaid on the session panel**, same as the issue drawer's
nested trace overlay (`issue-detail-drawer.tsx:655-675`). Overlay
mounting:

```ts
<TraceDetailDrawer
  open={!!overlayTraceId}
  traceId={overlayTraceId}
  urlSyncedTabs={false}                       // parent URL stays clean
  onClose={() => setOverlayTraceId(null)}
/>
```

The overlay carries the full trace detail surface — Spans tab,
Annotations tab, full Trace tab. The panel underneath stays mounted.
Closing the overlay returns to the panel's current trace + tab.

### Annotating from the panel

Users can add annotations directly from the Conversation tab on the
**currently-shown trace**. The flow and underlying primitives are
identical to the trace drawer — the existing `messageAnnotationSlot`
expander, the inline annotation form, the score-write call all carry
over unchanged. What changes is the user-facing language around
ownership:

- **Annotations attach to the current trace's span, not to the session.**
  An annotation is a statement about a specific moment (a particular
  message produced by a particular span), so the natural anchor is the
  trace it lives in. The session view rolls these up; it doesn't own
  them.
- **Success-toast wording is explicit about anchoring.** When an
  annotation is saved from the panel, the confirmation toast reads
  "Annotation added to turn N of this session" (rather than the trace
  drawer's "Annotation added"), so the user's mental model is right
  from the first interaction. `N` is the trace's position by
  `start_time` within `session.traceIds`.
- **New traces arriving later do not migrate older annotations.** If a
  user annotates turn 5, and turn 6 later lands in the same session,
  the annotation stays on turn 5. The Conversation tab's default
  `currentTraceId` advances to the latest trace per §3, so a later
  visitor opens on turn 6 by default — but the annotation on turn 5 is
  still discoverable via (a) the Issues tab if the annotation became a
  score with an `issue_id`, (b) navigating back to turn 5 through the
  row expansion. This is the correct behavior, not a bug — annotations
  describe moments, not sessions.
- **Session-level annotations are explicitly out of scope.** "This
  whole conversation was bad" doesn't have a useful anchor; if a
  specific turn was bad, annotate that turn. If no specific turn was
  bad, the annotation tends to collapse into "this session was a 7/10"
  feedback, which is a different ontology. We don't add session-grain
  scores to `scores` (no `target_kind = 'session'`); we don't build a
  session-grain annotation surface in this spec. If product demand
  surfaces it later, that's a separate feature.

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
gesture** that does three things behind the scenes:

1. Sets the panel's `currentTraceId` to that trace.
2. Switches the active tab from `Issues` to `Conversation`.
3. Scrolls to the message the annotation is anchored to, then
   briefly flashes a highlight on that message (reusing the
   `ScrollNavigator`'s existing target-flash affordance) so the user's
   eye lands on it immediately rather than just "near it."

Even though the implementation involves three internal transitions,
the user perceives a single response: "I clicked the issue and the
annotated turn is right there." Two design polishes keep that
perception honest:

- **Prefetch on Issues-tab visit.** When the Issues tab is mounted,
  the panel issues
  `queryClient.prefetchQuery(["traceDetail", traceId])` for every
  unique `traceId` in the loaded `SessionIssueRow.matchingTraceIds`
  arrays. `matchingTraceCount` per row × number of rows is bounded by
  the session's `traceCount` (typically <20); each prefetch is one
  trace's `getTraceDetail` call. Cross-trace clicks then feel
  instant. Same shape as the search-mode prefetch in
  `./5-search-highlights.md`'s "Per-trace re-highlighting".
- **Targeted post-scroll flash.** After the tab switch and scroll, the
  annotated message gets a short visual emphasis (background pulse or
  ring) tied to `data-annotation-id`. Same primitive the trace drawer
  already uses when an annotation hash-link is opened. This is the
  difference between "we landed on the right turn" feeling correct
  vs. feeling sloppy.

Same mechanic as the row-expansion path; the issue row is just a
secondary entry point into "switch trace + go to a specific message."

### Why this isn't a "weird UX of session → trace → conversation"

A natural worry with the rollup model is that drilling into an
annotation requires the user to traverse three surfaces (session
panel → trace panel → conversation → scroll). In this design, the
session panel **is** the conversation surface — the Conversation tab
inside it is the same `<Conversation>` primitive the trace drawer
renders. Switching `currentTraceId` doesn't navigate between distinct
surfaces; it changes which trace the panel's tab is rendering. The
two polishes above make that change feel like "the annotation is
right there" rather than "I just navigated three layers deep."

If telemetry later shows the transition still feels heavy, the
fallback affordance is a popover-on-issue-row mode: click an issue
row → popover with the annotation text + a secondary "View in
conversation" button. We don't ship that by default; it's a parking
spot if the polished version fails real-use feedback.

### Empty / loading / error states

- Empty (no issues): "No issues detected in this session."
- Loading: skeleton rows.
- Error: "Couldn't load issues — retry." Standard hook error UI.

---

## 7. Metadata tab

Session-level fields, none of which depend on `currentTraceId`. Read
once on tab visit.

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

  // Carried for the Conversation tab's initial-trace decision
  readonly traceIds: readonly string[]      // ordered by start_time asc
  readonly lastTraceId: string              // = traceIds[traceIds.length - 1]
}
```

Backed by a new repo method `SessionRepository.findBySessionId({
organizationId, projectId, sessionId })` returning a `SessionDetail`
(parity spec's analog of `TraceDetail`). The repo impl projects through
`DETAIL_SELECT` from
`packages/platform/db-clickhouse/src/repositories/session-repository.ts`,
paralleling `TraceRepository.findByTraceId` at `trace-repository.ts:1613-1643`.

### `getTraceDetail({ projectId, traceId })` (reused)

Existing. Called whenever the panel's `currentTraceId` changes.

### `getTraceSearchHighlights({ projectId, traceId, searchQuery })` (reused)

Existing, introduced by `./5-search-highlights.md`. Called alongside
`getTraceDetail` when `q` is non-empty.

### `listSessionIssuesBySessionId({ projectId, sessionId })` (reused)

From `./3-session-issue-dedup.md`. Drives the Issues tab.

---

## 9. Navigation

### Opening the panel

| Source | Initial trace per §3 | URL |
|---|---|---|
| Sessions list row click | Last trace (browse) / first matching (search) | `?sessionId=…&traceId=<resolved>` |
| Row expansion's trace row click | The clicked trace | `?sessionId=…&traceId=<clicked>` |
| Search result row click | First matching trace | `?sessionId=…&traceId=<first-match>&q=…` |
| Issue row → "View session" link | Last trace | `?sessionId=…&traceId=<last>` |
| Deep link | Per §3 | (as supplied) |

In every case the URL carries the session id and the resolved initial
trace id. Reload restores state.

### Closing

Standard drawer close: `Esc`, click the backdrop, or the close button.
URL params are cleared on close. The sessions-list row expansion stays
expanded if it was open (it's an independent piece of state).

### Inter-panel navigation

The panel can be open simultaneously with:

- The sessions-list row expansion (it's the trace navigator)
- The trace detail drawer overlay (when the user drills into a turn)
- The issue detail drawer overlay (when the user clicks an issue row's
  "open issue" link — out of scope here, but the pattern works)

Closing each surface peels one layer at a time.

---

## 10. Live updates

- **Status pill** polls `getSessionDetail` every **30 seconds** when
  `status === "live"`. Polling stops when the panel becomes `idle` or
  is closed. Re-uses the existing React Query refetch interval pattern.
- **Conversation tab** does **not** auto-poll. The user reloads
  manually to pick up new turns on the currently-shown trace. Rationale:
  cross-trace polling (a new trace appears that the panel isn't
  showing) is out of scope — the row expansion would surface a new
  trace row, and the user picks whether to switch into it.
- **Issues tab** does not auto-poll. Same reasoning — the panel is for
  reading, not for live-monitoring.

If down the line we want a live-tail experience for the active trace,
that's a Conversation-tab feature that lives in `<Conversation>`
itself, behind a separate spec.

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
  (new) — the panel component. Mirrors
  `trace-detail-drawer.tsx`'s structure (header, tabs, lazy mount).
- `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/session-detail-drawer/`
  — sub-folder for the three tab components:
  - `conversation-tab.tsx` — thin wrapper around the existing
    `ConversationTab` from the trace drawer, parameterized on
    `currentTraceId`.
  - `issues-tab.tsx` — list of `SessionIssueRow`.
  - `metadata-tab.tsx` — detail sections.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/sessions/-components/sessions-view.tsx`
  — wire row click to open the panel; thread the row expansion's
  selected trace into the panel's `currentTraceId`.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`
  — wire search-result row click to open the panel on the first matching
  trace (this is the entry point this epic ships first; the lift into
  unified `sessions` happens later per `0-problems.md`'s future-state UX
  context).
- `apps/web/src/domains/sessions/sessions.collection.ts` — add
  `useSessionDetail` hook (React Query wrapper).

---

## 12. Open questions

- **"Open in full session conversation view" as a power-user feature.**
  Some users may want to read the whole multi-trace conversation as a
  continuous stream (the original session-panel design). That's a
  separate surface — likely a dedicated route or full-page mode rather
  than a tab in the drawer. Park until we see whether the trace-by-trace
  navigation via row expansion meets the need.
- **Pre-fetch the last trace's detail when the user hovers a session
  row?** Cheap and would make the panel feel instant. Probably worth
  doing for the initial cut. Confirm with telemetry once shipped.
- **Pre-fetch all matching traces' highlights when opening a search
  result?** `matchingTraceIds` is bounded by the session's trace count
  (typically <20). Firing N parallel `getTraceSearchHighlights` calls
  on panel open is bounded work, and it makes cross-trace clicks in the
  expansion instant. Probably worth doing in V1 — flagged so we can
  measure cost before turning it on by default.
- **What happens if `currentTraceId` deep-links to a trace that's not
  in the session's `trace_ids`?** Fallback per §3 (last trace + warn).
  Worth deciding whether the URL gets rewritten to the fallback or
  just gets ignored.
- **Annotation badge on the row expansion's trace rows.** Should the
  expansion show a count of annotations per trace, mirroring the
  hit-count badge for search results? Probably yes, but it's a
  sessions-list spec concern, not a panel concern.
