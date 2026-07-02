import type { TraceSearchHighlightsResult } from "@domain/spans"
import {
  Button,
  Conversation,
  type FirstMatchHint,
  type HighlightRange,
  Icon,
  ScrollNavigator,
  type ScrollNavigatorHandle,
  Skeleton,
  Text,
} from "@repo/ui"
import { formatBytes } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { DownloadIcon } from "lucide-react"
import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { useAuthSession } from "../../../../../../../domains/sessions/session.collection.ts"
import { useConversationSpanMaps } from "../../../../../../../domains/spans/spans.collection.ts"
import {
  useTraceConversationMessages,
  useTraceSearchHighlights,
} from "../../../../../../../domains/traces/traces.collection.ts"
import type { TraceDetailRecord } from "../../../../../../../domains/traces/traces.functions.ts"
import type {
  ConversationTimeline,
  TimelineMarker,
} from "../../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import {
  messageIndexAtTime,
  visibleRangeToBand,
} from "../../../../../../../lib/conversation-timeline/message-windows.ts"
import { wallToTimeline } from "../../../../../../../lib/conversation-timeline/timeline-scale.ts"
import { AnnotationPopover } from "../../annotations/annotation-popover.tsx"
import {
  type TextSelectionPopoverControls,
  useAnnotationPopover,
} from "../../annotations/hooks/use-annotation-popover.ts"
import { useTraceAnnotationsData } from "../../annotations/hooks/use-trace-annotations-data.ts"
import { MessageAnnotationTrigger } from "../../annotations/message-annotation-trigger.tsx"
import { findNearestMessageAnchor, flashElement } from "../../conversation-timeline/flash-highlight.ts"
import { TimelineBar } from "../../conversation-timeline/timeline-bar.tsx"
import { useViewportBand } from "../../conversation-timeline/use-viewport-band.ts"
import {
  computeLoadedConversationHighlights,
  formatConversationSearchForBackend,
} from "./compute-loaded-conversation-highlights.ts"
import { ConversationSearchBar } from "./conversation-search-bar.tsx"
import {
  getFirstMatchHint,
  getNavigableSearchHighlights,
  resolveSearchScrollTarget,
  toSearchHighlightRanges,
} from "./navigable-search-highlights.ts"
import { scrollToSearchMatch } from "./scroll-to-highlight-match.ts"
import { SearchMatchNavigator } from "./search-match-navigator.tsx"

const LOAD_MORE_THRESHOLD_PX = 1200

// Staff-only (admins + impersonating + DEV) — never shown to regular customers.
function StaffConversationDownloadButton({
  traceId,
  messages,
}: {
  readonly traceId: string
  readonly messages: readonly unknown[]
}) {
  const { isAdmin, isImpersonating } = useAuthSession()
  const isStaff = import.meta.env.DEV || isAdmin || isImpersonating

  const handleDownload = useCallback(() => {
    const json = JSON.stringify(messages, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trace-${traceId.slice(0, 7)}-conversation-loaded.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [messages, traceId])

  if (!isStaff) return null
  return (
    <Button variant="ghost" size="sm" onClick={handleDownload} aria-label="Download conversation as JSON">
      <Icon icon={DownloadIcon} size="sm" />
    </Button>
  )
}

function ConversationContent({
  traceDetail,
  messages,
  navigateToSpan,
  projectId,
  isActive,
  annotationsEnabled,
  scrollContainerRef,
  textSelectionPopoverControlsRef,
  onPopoverClose,
  searchQuery,
  messageTrailingSlot,
  timeline,
  focusMessageIndex,
  totalMessages,
  payloadBytes,
  hasMoreMessages,
  isLoadingMoreMessages,
  onLoadMoreMessages,
}: {
  readonly traceDetail: TraceDetailRecord
  readonly messages: readonly GenAIMessage[]
  readonly navigateToSpan?: ((spanId: string) => void) | undefined
  readonly projectId: string
  readonly isActive: boolean
  /** Off under a sandbox scope — hides the inline annotate affordances and skips annotation fetches. */
  readonly annotationsEnabled: boolean
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null> | undefined
  readonly textSelectionPopoverControlsRef?: RefObject<TextSelectionPopoverControls | null> | undefined
  readonly onPopoverClose?: (() => void) | undefined
  readonly searchQuery?: string | undefined
  /** Renders a slot below each message (e.g. semantic moment labels). Receives the original messageIndex and role. */
  readonly messageTrailingSlot?: ((messageIndex: number, role: string) => ReactNode) | undefined
  /** Timeline for the minimap bar: null while loading, undefined when the feature is off. */
  readonly timeline?: ConversationTimeline | null | undefined
  readonly focusMessageIndex?: number | undefined
  readonly totalMessages: number
  readonly payloadBytes: number
  readonly hasMoreMessages: boolean
  readonly isLoadingMoreMessages: boolean
  readonly onLoadMoreMessages: () => unknown
}) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? internalScrollRef
  const navigatorRef = useRef<ScrollNavigatorHandle>(null)
  const navItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const clearSelectionRef = useRef<(() => void) | null>(null)
  const autoLoadingMoreRef = useRef(false)
  const hasScrolledToSearchRef = useRef<string | null>(null)

  const { data: spanMaps } = useConversationSpanMaps({
    projectId,
    traceId: traceDetail.traceId,
    startTime: traceDetail.startTime,
    allMessages: messages,
    enabled: messages.length > 0 && (annotationsEnabled || navigateToSpan !== undefined),
  })

  const band = useViewportBand({ scrollRef, timeline: timeline ?? null, isActive })

  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null)
  const hoverSlice = useMemo(
    () =>
      timeline && hoveredMessageIndex !== null
        ? visibleRangeToBand(timeline, hoveredMessageIndex, hoveredMessageIndex)
        : null,
    [timeline, hoveredMessageIndex],
  )

  const getSpanIdForMessage = useCallback((messageIndex: number) => spanMaps?.messageSpanMap[messageIndex], [spanMaps])

  const { messageLevelAnnotations, isCreatePending, isUpdatePending } = useTraceAnnotationsData({
    projectId,
    traceId: traceDetail.traceId,
    enabled: annotationsEnabled,
  })

  const {
    highlightRanges: annotationHighlightRanges,
    onAnnotationClick,
    handleTextSelect,
    openExistingAnnotationPopover,
    textSelectionPopoverPosition,
    textSelectionInitialPassed,
    textSelectionAnnotations,
    createTextSelectionAnnotation,
    updateTextSelectionAnnotation,
    closeAnnotationPopover,
    updateTextSelectionPopoverPosition,
  } = useAnnotationPopover({
    projectId,
    traceId: traceDetail.traceId,
    isActive,
    getSpanIdForMessage,
    annotationsEnabled,
  })

  const dismissSelectionUi = useCallback(() => {
    closeAnnotationPopover()
    clearSelectionRef.current?.()
  }, [closeAnnotationPopover])

  const scrollToMessageAnchor = useCallback(
    (messageIndex: number) => {
      const container = scrollRef.current
      if (!container) return
      const el = findNearestMessageAnchor(container, messageIndex)
      if (!el) return
      el.scrollIntoView({ block: "center", behavior: "smooth" })
      flashElement(el)
    },
    [scrollRef],
  )

  const handleTrackClick = useCallback(
    (timelineMs: number) => {
      if (!timeline) return
      dismissSelectionUi()
      const index = messageIndexAtTime(timeline, timelineMs)
      if (index !== null) scrollToMessageAnchor(index)
    },
    [timeline, dismissSelectionUi, scrollToMessageAnchor],
  )

  const loadMoreMessages = useCallback(() => {
    if (!hasMoreMessages || isLoadingMoreMessages || autoLoadingMoreRef.current) return

    autoLoadingMoreRef.current = true
    void Promise.resolve(onLoadMoreMessages())
      .catch(() => undefined)
      .finally(() => {
        autoLoadingMoreRef.current = false
      })
  }, [hasMoreMessages, isLoadingMoreMessages, onLoadMoreMessages])

  const maybeLoadMoreMessages = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom > LOAD_MORE_THRESHOLD_PX) return

    loadMoreMessages()
  }, [scrollRef, loadMoreMessages])

  const handleMarkerClick = useCallback(
    (marker: TimelineMarker) => {
      const container = scrollRef.current
      if (!container || !timeline) return
      dismissSelectionUi()
      switch (marker.kind) {
        case "annotation": {
          // Text-anchored annotations open in context; the instant scroll keeps
          // the popover position measured against the settled layout.
          const el = annotationsEnabled
            ? container.querySelector<HTMLElement>(`[data-annotation-id="${marker.annotationId}"]`)
            : null
          if (el) {
            el.scrollIntoView({ block: "center" })
            const rect = el.getBoundingClientRect()
            onAnnotationClick(marker.annotationId, { x: rect.left + rect.width / 2, y: rect.bottom })
            return
          }
          scrollToMessageAnchor(marker.messageIndex ?? timeline.messages.length - 1)
          return
        }
        case "moment":
          scrollToMessageAnchor(marker.messageIndex)
          return
        case "toolCall": {
          const el = marker.toolCallId
            ? container.querySelector<HTMLElement>(`[data-tool-call-id="${marker.toolCallId}"]`)
            : null
          if (el) {
            el.scrollIntoView({ block: "center", behavior: "smooth" })
            flashElement(el)
            return
          }
          handleTrackClick(wallToTimeline(timeline.scale, marker.atMs))
          return
        }
        case "trace": {
          const index =
            marker.firstMessageIndex ?? messageIndexAtTime(timeline, wallToTimeline(timeline.scale, marker.atMs))
          scrollToMessageAnchor(index ?? 0)
          return
        }
      }
    },
    [
      scrollRef,
      timeline,
      dismissSelectionUi,
      annotationsEnabled,
      onAnnotationClick,
      scrollToMessageAnchor,
      handleTrackClick,
    ],
  )

  const [debouncedConversationSearch, setDebouncedConversationSearch] = useState("")
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  const handleDebouncedSearchQueryChange = useCallback((query: string) => {
    setDebouncedConversationSearch(query)
  }, [])

  const effectiveSearchQuery = searchQuery ?? ""
  const loadedConversationHighlights = useMemo(
    () => computeLoadedConversationHighlights(messages, debouncedConversationSearch),
    [debouncedConversationSearch, messages],
  )

  const localNavigableMatches = useMemo(
    () => getNavigableSearchHighlights(loadedConversationHighlights.highlights),
    [loadedConversationHighlights],
  )

  const needsRemoteSearchFallback =
    debouncedConversationSearch.length > 0 && localNavigableMatches.length === 0 && hasMoreMessages

  const backendConversationSearchQuery = useMemo(
    () => formatConversationSearchForBackend(debouncedConversationSearch),
    [debouncedConversationSearch],
  )

  const { data: projectSearchHighlightsData } = useTraceSearchHighlights({
    projectId,
    traceId: traceDetail.traceId,
    searchQuery: effectiveSearchQuery,
    enabled: debouncedConversationSearch.length === 0 && effectiveSearchQuery.length > 0,
  })

  const { data: remoteFallbackHighlightsData, isFetching: isRemoteSearchFallbackFetching } = useTraceSearchHighlights({
    projectId,
    traceId: traceDetail.traceId,
    searchQuery: backendConversationSearchQuery,
    enabled: needsRemoteSearchFallback && backendConversationSearchQuery.length > 0,
  })

  const searchHighlightsData = useMemo<TraceSearchHighlightsResult | undefined>(() => {
    if (debouncedConversationSearch.length > 0) {
      if (localNavigableMatches.length > 0) return loadedConversationHighlights
      if (needsRemoteSearchFallback && remoteFallbackHighlightsData) return remoteFallbackHighlightsData
      return loadedConversationHighlights
    }
    return projectSearchHighlightsData
  }, [
    debouncedConversationSearch,
    loadedConversationHighlights,
    localNavigableMatches.length,
    needsRemoteSearchFallback,
    projectSearchHighlightsData,
    remoteFallbackHighlightsData,
  ])

  const navigableMatches = useMemo(
    () => getNavigableSearchHighlights(searchHighlightsData?.highlights ?? []),
    [searchHighlightsData],
  )

  const activeSearchQuery =
    debouncedConversationSearch.length > 0 ? debouncedConversationSearch : effectiveSearchQuery.trim()
  const searchNavigationActive = activeSearchQuery.length > 0 && navigableMatches.length > 0
  const remoteFallbackFirstMatch = useMemo(() => {
    if (!needsRemoteSearchFallback || !remoteFallbackHighlightsData) return null
    return getNavigableSearchHighlights(remoteFallbackHighlightsData.highlights)[0] ?? null
  }, [needsRemoteSearchFallback, remoteFallbackHighlightsData])
  const isSearchingUnloadedConversation =
    needsRemoteSearchFallback &&
    (isRemoteSearchFallbackFetching ||
      (remoteFallbackFirstMatch != null && remoteFallbackFirstMatch.messageIndex >= messages.length))

  useHotkeys([
    {
      hotkey: "N",
      callback: () => {
        if (searchNavigationActive) {
          setActiveMatchIndex((index) => Math.min(index + 1, navigableMatches.length - 1))
          return
        }
        navigatorRef.current?.navigate("down")
      },
      options: { enabled: isActive, ignoreInputs: true },
    },
    {
      hotkey: "P",
      callback: () => {
        if (searchNavigationActive) {
          setActiveMatchIndex((index) => Math.max(index - 1, 0))
          return
        }
        navigatorRef.current?.navigate("up")
      },
      options: { enabled: isActive, ignoreInputs: true },
    },
  ])

  // TODO(frontend-use-effect-policy): resets the active match when the debounced query changes.
  useEffect(() => {
    setActiveMatchIndex(0)
  }, [activeSearchQuery])

  const searchHighlightRanges = useMemo(
    () => toSearchHighlightRanges(searchHighlightsData, searchNavigationActive ? activeMatchIndex : null),
    [activeMatchIndex, searchHighlightsData, searchNavigationActive],
  )

  const mergedHighlightRanges = useMemo<readonly HighlightRange[]>(
    () => [...annotationHighlightRanges, ...searchHighlightRanges],
    [annotationHighlightRanges, searchHighlightRanges],
  )

  const firstMatchHint = useMemo<FirstMatchHint | null>(
    () => getFirstMatchHint(searchHighlightsData),
    [searchHighlightsData],
  )

  // TODO(frontend-use-effect-policy): loading search target pages is a query-side effect keyed by async highlight results.
  useEffect(() => {
    if (debouncedConversationSearch.length > 0) return
    if (!firstMatchHint || firstMatchHint.messageIndex < messages.length) return
    loadMoreMessages()
  }, [debouncedConversationSearch, firstMatchHint, messages.length, loadMoreMessages])

  // TODO(frontend-use-effect-policy): loads conversation chunks until a remote lexical match is in view.
  useEffect(() => {
    if (!needsRemoteSearchFallback || !remoteFallbackFirstMatch) return
    if (remoteFallbackFirstMatch.messageIndex < messages.length) return
    loadMoreMessages()
  }, [needsRemoteSearchFallback, remoteFallbackFirstMatch, messages.length, loadMoreMessages])

  useEffect(() => {
    if (focusMessageIndex === undefined || focusMessageIndex < messages.length) return
    loadMoreMessages()
  }, [focusMessageIndex, messages.length, loadMoreMessages])

  const searchScrollTarget = useMemo(
    () =>
      activeSearchQuery.length > 0
        ? resolveSearchScrollTarget({
            result: searchHighlightsData,
            navigableMatches,
            activeNavigableIndex: activeMatchIndex,
          })
        : null,
    [activeMatchIndex, activeSearchQuery, navigableMatches, searchHighlightsData],
  )

  // TODO(frontend-use-effect-policy): scrolls to the active search match after highlight DOM mounts.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !searchScrollTarget) {
      hasScrolledToSearchRef.current = null
      return
    }
    if (searchScrollTarget.messageIndex >= messages.length) return

    const scrollKey = JSON.stringify({
      query: activeSearchQuery,
      matchIndex: activeMatchIndex,
      target: searchScrollTarget,
    })
    if (hasScrolledToSearchRef.current === scrollKey) return
    hasScrolledToSearchRef.current = scrollKey

    return scrollToSearchMatch(container, searchScrollTarget)
  }, [activeMatchIndex, activeSearchQuery, messages.length, scrollRef, searchScrollTarget])

  if (textSelectionPopoverControlsRef) {
    textSelectionPopoverControlsRef.current = {
      openExistingAnnotationPopover,
      updateTextSelectionPopoverPosition,
    }
  }

  const messageActions =
    navigateToSpan && spanMaps && Object.keys(spanMaps.messageSpanMap).length > 0
      ? new Map(
          Object.entries(spanMaps.messageSpanMap).map(([idx, spanId]) => [Number(idx), () => navigateToSpan(spanId)]),
        )
      : undefined

  const toolCallActions =
    navigateToSpan && spanMaps && Object.keys(spanMaps.toolCallSpanMap).length > 0
      ? new Map(
          Object.entries(spanMaps.toolCallSpanMap).map(([toolCallId, spanId]) => [
            toolCallId,
            () => navigateToSpan(spanId),
          ]),
        )
      : undefined

  // A "successful" result part from a failed execution span should always
  // render as failed.
  const failedToolCallIds = timeline && timeline.failedToolCallIds.size > 0 ? timeline.failedToolCallIds : undefined

  const showBar = timeline != null && timeline.scale.totalTimelineMs > 0 && timeline.messages.length > 0

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <ConversationSearchBar className="min-w-0 flex-1" onDebouncedQueryChange={handleDebouncedSearchQueryChange} />
          {isSearchingUnloadedConversation ? (
            <Text.H6 color="foregroundMuted" className="shrink-0">
              Searching…
            </Text.H6>
          ) : null}
          <div className="flex shrink-0 items-center gap-1.5">
            <StaffConversationDownloadButton traceId={traceDetail.traceId} messages={messages} />
            {searchNavigationActive ? (
              <SearchMatchNavigator
                activeIndex={activeMatchIndex}
                matchCount={navigableMatches.length}
                onPrevious={() => setActiveMatchIndex((index) => Math.max(index - 1, 0))}
                onNext={() => setActiveMatchIndex((index) => Math.min(index + 1, navigableMatches.length - 1))}
              />
            ) : (
              <ScrollNavigator
                ref={navigatorRef}
                scrollContainerRef={scrollRef}
                itemRefs={navItemRefs}
                prevLabel={
                  <>
                    Previous <HotkeyBadge hotkey="P" />
                  </>
                }
                nextLabel={
                  <>
                    Next <HotkeyBadge hotkey="N" />
                  </>
                }
              />
            )}
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-col py-8 px-4 overflow-y-auto overflow-x-hidden flex-1"
        onScroll={maybeLoadMoreMessages}
        onPointerMove={(e) => {
          const anchor = e.target instanceof HTMLElement ? e.target.closest("[data-message-index]") : null
          const raw = anchor?.getAttribute("data-message-index")
          const index = raw == null ? Number.NaN : Number.parseInt(raw, 10)
          setHoveredMessageIndex(Number.isNaN(index) ? null : index)
        }}
        onPointerLeave={() => setHoveredMessageIndex(null)}
      >
        <Conversation
          messages={messages}
          enableNavigator
          scrollContainerRef={scrollRef}
          navigatorRef={navigatorRef}
          navItemRefsRef={navItemRefs}
          clearSelectionRef={clearSelectionRef}
          highlightRanges={mergedHighlightRanges}
          firstMatchHint={firstMatchHint}
          {...(failedToolCallIds ? { failedToolCallIds } : {})}
          {...(annotationsEnabled
            ? {
                messageAnnotationSlot: (messageIndex: number, role: string) => {
                  const data = messageLevelAnnotations.get(messageIndex)
                  return (
                    <MessageAnnotationTrigger
                      key={data?.annotations.map((a) => a.id).join(",") ?? `no-annotation-${messageIndex}`}
                      messageIndex={messageIndex}
                      messageRole={role}
                      projectId={projectId}
                      traceId={traceDetail.traceId}
                      spanId={spanMaps?.messageSpanMap[messageIndex]}
                      annotations={data?.annotations ?? []}
                      annotators={data?.annotators ?? []}
                      onClose={onPopoverClose}
                    />
                  )
                },
                onTextSelect: handleTextSelect,
                onSelectionDismiss: closeAnnotationPopover,
                onAnnotationClick,
              }
            : {})}
          {...(messageActions ? { messageActions } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
          {...(messageTrailingSlot ? { messageTrailingSlot } : {})}
        />
        {hasMoreMessages ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Text.H6 color="foregroundMuted">
              Showing {messages.length} of {totalMessages} messages ({formatBytes(payloadBytes)} total payload)
            </Text.H6>
            {isLoadingMoreMessages ? <Text.H6 color="foregroundMuted">Loading more messages…</Text.H6> : null}
          </div>
        ) : null}
        {annotationsEnabled ? (
          <AnnotationPopover
            position={textSelectionPopoverPosition}
            scrollContainerRef={scrollRef}
            projectId={projectId}
            annotations={textSelectionAnnotations}
            showCreateForm={textSelectionAnnotations.length === 0}
            createInitialPassed={textSelectionInitialPassed}
            createAutoFocus={textSelectionInitialPassed !== null}
            isCreateLoading={isCreatePending}
            isUpdateLoading={isUpdatePending}
            onSave={createTextSelectionAnnotation}
            onUpdate={updateTextSelectionAnnotation}
            onClose={() => {
              closeAnnotationPopover()
              clearSelectionRef.current?.()
              onPopoverClose?.()
            }}
          />
        ) : null}
      </div>
      {timeline === null && (
        <div className="border-t border-border bg-background px-4 py-3">
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {showBar && timeline && (
        <TimelineBar
          timeline={timeline}
          band={band}
          hoverSlice={hoverSlice}
          onTrackClick={handleTrackClick}
          onMarkerClick={handleMarkerClick}
        />
      )}
    </div>
  )
}

export function ConversationTab({
  traceDetail,
  isDetailLoading,
  navigateToSpan,
  projectId,
  isActive,
  annotationsEnabled = true,
  scrollContainerRef,
  textSelectionPopoverControlsRef,
  onPopoverClose,
  searchQuery,
  messageTrailingSlot,
  timeline,
  focusMessageIndex,
}: {
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isDetailLoading: boolean
  /** Optional callback to navigate to a span. If not provided, message/tool call actions are hidden. */
  readonly navigateToSpan?: ((spanId: string) => void) | undefined
  readonly projectId: string
  readonly isActive: boolean
  /** Off under a sandbox scope — hides inline annotate affordances and skips annotation fetches. Defaults on. */
  readonly annotationsEnabled?: boolean
  /** Optional ref to the scroll container. Used for external scroll control (e.g., annotation navigation). */
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null> | undefined
  readonly textSelectionPopoverControlsRef?: RefObject<TextSelectionPopoverControls | null> | undefined
  /** Optional callback when annotation popover closes. Used to clear selection state. */
  readonly onPopoverClose?: (() => void) | undefined
  readonly searchQuery?: string | undefined
  /** Renders a slot below each message (e.g. semantic moment labels). Receives the original messageIndex and role. */
  readonly messageTrailingSlot?: ((messageIndex: number, role: string) => ReactNode) | undefined
  /** Timeline for the minimap bar: null while loading, undefined when the feature is off. */
  readonly timeline?: ConversationTimeline | null | undefined
  readonly focusMessageIndex?: number | undefined
}) {
  const conversation = useTraceConversationMessages({
    projectId,
    traceId: traceDetail?.traceId ?? "",
    enabled: traceDetail != null,
  })

  if (isDetailLoading || (traceDetail && conversation.isLoading)) {
    return (
      <div className="flex flex-col gap-4 py-8 px-4 flex-1">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!traceDetail) {
    return (
      <div className="flex items-center justify-center py-6 flex-1">
        <Text.H5 color="foregroundMuted">No conversation data</Text.H5>
      </div>
    )
  }

  return (
    <ConversationContent
      isActive={isActive}
      annotationsEnabled={annotationsEnabled}
      traceDetail={traceDetail}
      messages={conversation.messages}
      navigateToSpan={navigateToSpan}
      projectId={projectId}
      scrollContainerRef={scrollContainerRef}
      textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
      onPopoverClose={onPopoverClose}
      searchQuery={searchQuery}
      messageTrailingSlot={messageTrailingSlot}
      timeline={timeline}
      focusMessageIndex={focusMessageIndex}
      totalMessages={conversation.totalMessages}
      payloadBytes={conversation.payloadBytes}
      hasMoreMessages={conversation.hasNextPage}
      isLoadingMoreMessages={conversation.isFetchingNextPage}
      onLoadMoreMessages={() => conversation.fetchNextPage()}
    />
  )
}
