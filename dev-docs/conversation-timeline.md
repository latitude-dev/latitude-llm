# Conversation Timeline

The conversation timeline is a scroll-linked minimap of a trace or session conversation: a bar at the bottom of the **Conversation tab** (trace detail drawer, session detail drawer, and the nested trace slot, which reuses the trace drawer body) showing what the agent was doing at every moment, with an event-marker lane underneath. The conversation itself is always the full, static, interactive one — the bar and the scroll container are two synchronized views of the same conversation, one indexed by time, one by scroll position. Nothing replays or animates on its own.

## Product behavior

- The bar renders below the conversation: an activity-colored track (with hatched compressed idle gaps and trace notches) and a marker lane. While the timeline loads, a slim skeleton holds its place; a conversation with no timing data renders no bar.
- **Viewport band:** the track dims everything *outside* the time range covered by the messages currently visible in the scroll viewport (`bg-background/70` overlays on both sides; the visible range stays full-color). The band is derived purely from scroll position, so it follows scrolling with no state of its own. Because time-width and scroll-height don't correlate (a 30s generation can be a two-line message), the band stretches non-linearly while scrolling — that is the point: it shows where the on-screen messages sit in time.
- **Click-to-navigate:** clicking anywhere on the track scrolls the conversation to the message whose time window contains that position and flashes it (a transient ring, ~4s). Clicking inside a compressed gap goes to the first message of the next trace. Marker clicks dispatch by kind:
  - *annotation* → scrolls to the highlighted text (`[data-annotation-id]`) and opens the annotation popover; annotations without a text anchor scroll to + flash the anchored message (conversation-level ones, the last message).
  - *failed tool* → scrolls to + flashes the tool call block (`[data-tool-call-id]`, attribute on `ToolCallBlock`'s wrapper).
  - *moment* → scrolls to + flashes the message carrying the behaviour-moment label.
  - *trace* → scrolls to the turn-starting user message.
  - Cluster chips navigate to their earliest member.
- Hovering the track shows a ghost line with a chip: wall-clock time plus the activity at that position ("Generating · 4.2s"); over a compressed gap, just "Idle · +2m" (wall time inside a compressed gap is interpolated and misleading, so it is omitted). Hovering a marker or chip shows a rich event card instantly in the slot above the bar.
- Idle gaps between traces (user think-time ≥5s) occupy a small constant width on the track (hatched, labeled "+2m" etc.).
- `N`/`P` remain the message navigator keys; markers are real buttons (keyboard reachable). The track itself is a pointer-only shortcut.

## Timing data and fidelity

The timeline is reconstructed entirely from recorded span timing — nothing extra is ingested:

- Spans carry `startTime`/`endTime` (ns precision in ClickHouse, ms after ISO serialization), `timeToFirstTokenNs`, `isStreaming`, `operation`, and `statusCode`.
- Message↔span attribution uses `buildConversationSpanMaps` (`packages/domain/spans/src/use-cases/map-conversation-to-spans.ts`), which fingerprints assistant message content against span `output_messages` and disambiguates duplicates by preceding-context score. It only maps **assistant** messages; user/system/tool messages get derived times (see scheduling rules).
- Per-trace message spans come from `listConversationMessageSpans` → `SpanRepository.findMessagesForTrace`, cached under `conversationMessageSpans`. Session attribution (`useSessionConversationSpanMaps`) does **not** load every session message payload: it fetches that same per-trace projection for an oldest-first window of traces that grows with the loaded conversation prefix (`selectTracesForLoadedConversation`), then runs `buildConversationSpanMaps` against the loaded messages only. Tool-call → span links also come from lightweight `listSpansBySession` rows (`toolCallId`), so execute_tool navigation works before message spans arrive. Keys index into the **latest output trace's loaded conversation chunks**; values are span refs (`traceId` + `spanId`) from any fetched trace in the window.

## Core model

The pure logic lives in `apps/web/src/lib/conversation-timeline/` (no React, fully unit-tested):

### `timeline-scale.ts` — coordinate system

Two time domains: **wall-clock ms** (real timestamps) and **timeline ms** (the track domain, 0-based). `buildTimelineScale(traceWindows)` merges overlapping/abutting windows (clock-skew tolerance; gaps < `MIN_COMPRESSIBLE_GAP_MS` = 5s stay linear) and emits alternating active/gap segments, where each compressed gap maps to a constant `GAP_TIMELINE_MS` = 1.5s of track width. `wallToTimeline`/`timelineToWall`/`timelineToPct` are piecewise-linear over the segments.

### `build-conversation-timeline.ts` — the model

`buildConversationTimeline({ messages, spans, messageSpanMap, toolCallSpanMap, traces, annotations, moments })` produces index-aligned per-message `schedules`, sorted `markers`, `failedToolCallIds`, the `activity` track, and the scale.

Schedules are each message's time window on the timeline (single forward walk, monotonic fallback chain):

- **System** message → instant at session start.
- **User** message → instant at the start of the trace it initiated (new-turn detection: the next mapped assistant span belongs to a different trace than the previous one); intra-trace user messages land at the consuming span's start. Clamped monotonic.
- **Assistant** message with a mapped streaming span → `streamed` window from `start + TTFT` to span end. A run of consecutive assistant messages mapped to the *same* span splits the window proportionally by character count. Non-streaming, zero-window, or `TTFT ≥ duration` collapse to instant at span end.
- **Tool** message → per-part `toolResult` times at the matching `execute_tool` span's end; fallbacks: next mapped assistant span's start, then emit+1ms.
- **Unmapped assistant** messages (fingerprint miss) → instant at previous event +1ms. If *nothing* is mapped, the whole conversation degrades to evenly spaced instants — band and clicks still work, just approximately.

Markers (the event lane) are exactly four kinds, each carrying the anchor its click needs:

- `trace` — one per trace at its start (= the user interaction). `label` is the raw root span name; "Turn N" strings are composed in the UI from `traceIndex`. Carries a `userExcerpt` and `firstMessageIndex` of the turn-starting user message.
- `annotation` — placed at the **completion time of the anchored message** (via `metadata.messageIndex` → schedule), never at `createdAt`; conversation-level annotations land at the timeline end. Carries `messageIndex`, `flaggerSlug` when created by a Latitude flagger, and `annotatorName` resolved in the data-assembly hooks (members map; agent-provenance annotations resolve to "Latitude Agent").
- `toolCall` — **failed** tool executions only (`execute_tool` + error status). Successful tools never mark the lane, regardless of duration. Carries the `toolCallId` (for the DOM anchor) and an `errorExcerpt` (≤180 chars): the mapped tool's returned output (via `toolCallSpanMap` reverse lookup into the tool message parts), falling back to the span's `statusMessage`.
- `moment` — behaviour-moment labels from conversation intelligence (session timeline only), anchored at the completion of the label's `lastMessageIndex` message. Carries `messageIndex` and the label's `confidence`.

Errored non-tool spans deliberately produce no marker: container spans inherit error status from failing children, which previously produced confusing duplicate markers at trace end.

### `build-activity-track.ts` — what the agent was doing

The track background is painted by activity phases computed with the same category model as the trace duration bar (`duration-composition.ts`): leaf spans only (containers excluded), categories generation/tool/retrieval/other, overlap resolved by that priority order, uncovered in-trace time is `idle`. Output is time-ordered segments in timeline coordinates, clipped to active windows; the scale's compressed gaps render separately as hatched separators. Colors come from the exported `DURATION_COLORS` so the timeline track and the duration bar always match.

### `message-windows.ts` — time↔message mapping

- `messageIndexAtTime(timeline, timelineMs)` — the message a track position lands on: the last message whose window starts at or before that wall time; inside a compressed gap, the first message of the next trace. Drives bare track clicks.
- `visibleRangeToBand(timeline, firstIndex, lastIndex)` — track band (percent) covering the time windows of a message index range. Drives the viewport band.
- Both build on `scheduleStartMs`/`scheduleCompletionMs` exported from `build-conversation-timeline.ts`.

### `cluster-markers.ts` — lane density

Markers that would visually overlap collapse into a chip showing the first member's icon plus a count. Clusters are anchored to their first member — a marker joins only while within one chip-width of the cluster's anchor, so dense lanes pack into as many chips as fit instead of chaining into one mega-cluster. The threshold is pixel-aware: the track measures the lane via `ResizeObserver` and converts a chip's pixel width into a track percentage, so density adapts to the drawer width.

## UI architecture

Page-local components in `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/conversation-timeline/`:

- `timeline-bar.tsx` — the bar: hover-card slot + the track. No controls row.
- `timeline-track.tsx` — the track: activity segments, hatched gap separators, trace notches, the two band-dimming overlays, the hover ghost line + chip, and the marker lane (user-icon circles for interactions, message-square for annotations, the `LatitudeLogo` brand mark for flagger annotations, red wrench for failed tools, violet `TagsIcon` for moments). Pointer-only click target; markers are buttons.
- `timeline-event-card.tsx` — `markerIcon`/`markerAriaLabel` plus `TimelineEventCardContent` and `TimelineEventHoverCard`. Card anatomy: colored icon + uppercase event-type header, main line (user excerpt / tool name / verdict / moment kind), muted body excerpt, and a footer meta row (wall-clock time · kind-specific meta like duration, author, or confidence).
- `use-viewport-band.ts` — measures which `[data-message-index]` nodes intersect the scroll viewport (rAF-throttled scroll listener + `ResizeObserver` on the container and its content) and maps the first/last visible index through `visibleRangeToBand`. Returns null when nothing is measurable (hidden tab, no timeline), which renders no dimming.
- `flash-highlight.ts` — `flashElement` (the transient boxShadow ring, same style as annotation navigation) and `findNearestMessageAnchor` (exact `[data-message-index]` hit, else nearest by index distance — tool messages can be absorbed into their caller's block, so exact anchors may not render). Shared with the session tab's moment-focus scrolling.
- `use-trace-timeline.ts` / `use-session-timeline.ts` — data assembly per surface, called by the trace drawer body and the session conversation tab respectively; both feed `buildConversationTimeline` through `timeline-adapters.ts`. Queries are shared with what the drawers already fetch (React Query key reuse), so the always-on bar mostly adds only the conversation↔span mapping call.
- The session hook receives behaviour moments from the session conversation tab, which already fetches them for its per-message pills (`useSessionMomentIntelligence`); the trace timeline passes an empty moments list since moment analysis is session-scoped.

Integration point is `trace-detail-drawer/tabs/conversation-tab.tsx` (`ConversationContent`): it renders the bar (or its loading skeleton) below the scroll container and owns the click dispatch (`handleTrackClick`/`handleMarkerClick`, which also dismiss any open annotation popover before navigating). The `timeline` prop distinguishes `null` (loading → skeleton) from `undefined` (feature off → nothing).

The shared `@repo/ui` `genai-conversation` component carries two timeline-generic extensions: `failedToolCallIds` threading `Conversation → Message → Part → ToolCallBlock` (forces failed rendering — border, X status, destructive result block — when the execution span errored, even if the response part claims success; sourced from `ConversationTimeline.failedToolCallIds`), and a `data-tool-call-id` attribute on `ToolCallBlock`'s wrapper used as the failed-tool markers' scroll anchor.

## Invariants

- The timeline never mutates or refetches conversation content — it only reads recorded span timing and maps it to scroll anchors.
- All times in the model are clamped to `[wallStart, wallEnd]` and schedules are monotonic; marker placement for annotations is the anchored message's completion time, never `createdAt`.
- The timeline rebuilds whenever its inputs change (e.g. an annotation is created); the band is recomputed from scroll on every rebuild.

## Testing

- The pure model is unit-tested with colocated vitest files in `apps/web/src/lib/conversation-timeline/` (`timeline-scale`, `build-conversation-timeline`, `build-activity-track`, `message-windows`, `cluster-markers`) against a shared fixture session (`timeline-fixture.ts`: two turns, streaming + non-streaming spans, a tool loop, an idle gap, annotations, a moment). Key covered properties: coordinate round-trips, gap compression, scheduling rules and fallbacks, marker placement and anchors, time→message resolution (including gap clicks), and band math.
- Trace-window selection for session attribution is unit-tested in `apps/web/src/domains/spans/select-traces-for-loaded-conversation.test.ts`.
- Bar/track components are verified manually; they intentionally have no unit tests.
