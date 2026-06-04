import type { FilterSet } from "@domain/shared"
import { Button, DetailDrawer, Icon, Skeleton, Tooltip } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ChevronLeftIcon } from "lucide-react"
import { HotkeyBadge } from "../../../../../components/hotkey-badge.tsx"
import { useSessionDetail } from "../../../../../domains/sessions/sessions.collection.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { IssueLifecycleActions } from "../issues/-components/issue-lifecycle-actions.tsx"
import { IssueSlot } from "./session-detail-drawer/issue-slot.tsx"
import { isSessionTab, SessionSlot } from "./session-detail-drawer/session-slot.tsx"
import { type DetailSlotKind, SlotTransition } from "./session-detail-drawer/slot-transition.tsx"
import { isTraceDetailTab, type TraceDetailTabId, TraceSlot } from "./session-detail-drawer/trace-slot.tsx"
import { useSessionTraces } from "./session-detail-drawer/use-session-traces.ts"

export type OpenTraceOptions = {
  /** Focuses an inline annotation after the trace slot mounts. Implies `conversation` as the default tab. */
  readonly focusAnnotationId?: string
  /** Overrides which tab the trace slot lands on. Defaults: `conversation` with focus, otherwise `trace`. */
  readonly targetTab?: TraceDetailTabId
}

export function SessionDetailDrawer({
  projectId,
  sessionId,
  onClose,
  searchQuery,
  filters,
  onFiltersChange,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly onClose: () => void
  readonly searchQuery?: string
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: ((filters: FilterSet) => void) | undefined
}) {
  const [traceId, setTraceId] = useParamState("traceId", "")
  const [issueId, setIssueId] = useParamState("issueId", "")
  const [, setFocusAnnotationId] = useParamState("annotationId", "")
  const [q] = useParamState("q", "")
  const defaultSessionTab = q.length > 0 ? "conversation" : "session"
  const [activeTab, setActiveTab] = useParamState("sessionTab", defaultSessionTab, {
    validate: isSessionTab,
  })
  // Owned by `TraceSlot` once it mounts, but written here when sliding into a
  // trace so the slot lands on the requested tab (Issues → "trace",
  // Annotations → "conversation"). Kept distinct from `sessionTab` so the two
  // never collide.
  const [, setTraceTab] = useParamState<TraceDetailTabId>("traceTab", "trace", { validate: isTraceDetailTab })

  const { data: session, isLoading: sessionLoading } = useSessionDetail({
    projectId,
    sessionId,
  })
  const { traces } = useSessionTraces({ projectId, sessionId, traceIds: session?.traceIds ?? [] })

  // The session search returns hits from the trace search index, which can
  // reference traces that have no row in the `sessions` table. Two cases
  // (see `search-by-project.ts:100-127`):
  //   1. **Pre-migration orphan**: trace written before migration 00016
  //      (#3224), when `sessions_mv` filtered `WHERE session_id != ''`. The
  //      search index entry survives until its TTL (90 days lexical / 30
  //      days embedding) but no `sessions` row was ever materialized.
  //   2. **MV replication lag**: the trace landed but `sessions_mv` hasn't
  //      propagated yet — a structural race between the two write paths.
  //
  // In both cases the search list synthesizes a stand-in Session via
  // `toOrphanSession(row)` where `sessionId = toString(trace_id)`. So when
  // `findBySessionId` returns null here, we render the trace slot using the
  // same id as a traceId — the orphan's underlying trace exists. Falls back
  // to TraceDetailBody's own not-found UI if neither resolves.
  const isSessionMissing = !sessionLoading && !session

  // Defensive precedence for URLs that arrive with both params already set
  // (deep links, browser history, hand-edited URLs). Our own code never sets
  // both at the same time — opening a trace from inside the issue slot uses
  // `IssueDetailBody`'s local Sheet state, not the `traceId` param. Trace
  // wins so a stale `issueId` doesn't shadow the requested trace; "View
  // session" clears both so we can't land in an ambiguous state after close.
  // When the session itself is missing we suppress the back affordance —
  // there is nothing to go back to.
  const detailKind: DetailSlotKind | null = traceId.length > 0 ? "trace" : issueId.length > 0 ? "issue" : null
  const showDetail = detailKind !== null && !isSessionMissing

  const openTrace = (nextTraceId: string, options: OpenTraceOptions = {}) => {
    const { focusAnnotationId, targetTab } = options
    setFocusAnnotationId(focusAnnotationId ?? "")
    setTraceTab(targetTab ?? (focusAnnotationId ? "conversation" : "trace"))
    setTraceId(nextTraceId)
  }

  const openIssue = (nextIssueId: string) => {
    setFocusAnnotationId("")
    setTraceId("")
    setIssueId(nextIssueId)
  }

  const focusAnnotationInConversation = (annotationId: string) => {
    setFocusAnnotationId(annotationId)
    setActiveTab("conversation")
  }

  const backToSession = () => {
    setFocusAnnotationId("")
    setTraceId("")
    setIssueId("")
  }

  const handleClose = () => {
    setFocusAnnotationId("")
    setTraceId("")
    setIssueId("")
    onClose()
  }

  useHotkeys([
    {
      hotkey: "Escape",
      callback: () => (showDetail ? backToSession() : handleClose()),
      options: { ignoreInputs: true, conflictBehavior: "allow" },
    },
  ])

  return (
    <DetailDrawer
      storeKey="session-detail-drawer-width"
      onClose={handleClose}
      closeLabel={
        <>
          Close <HotkeyBadge hotkey="Escape" />
        </>
      }
      actions={
        showDetail ? (
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button variant="default-soft" onClick={backToSession} type="button">
                <Icon icon={ChevronLeftIcon} />
                View session
              </Button>
            }
          >
            View session <HotkeyBadge hotkey="Escape" />
          </Tooltip>
        ) : undefined
      }
      rightActions={
        detailKind === "issue" ? <IssueLifecycleActions projectId={projectId} issueId={issueId} /> : undefined
      }
    >
      {sessionLoading && !session ? (
        <div className="flex flex-col gap-4 px-6 py-5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isSessionMissing ? (
        <TraceSlot projectId={projectId} traceId={traceId || sessionId} {...(searchQuery ? { searchQuery } : {})} />
      ) : !session ? null : (
        <SlotTransition
          detailKind={detailKind}
          sessionSlot={
            <SessionSlot
              projectId={projectId}
              session={session}
              traces={traces}
              latestTraceId={session.latestTraceId}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              onOpenTrace={openTrace}
              onOpenIssue={openIssue}
              onOpenInConversation={focusAnnotationInConversation}
              {...(searchQuery ? { searchQuery } : {})}
              {...(filters ? { filters } : {})}
              {...(onFiltersChange ? { onFiltersChange } : {})}
            />
          }
          traceSlot={
            detailKind === "trace" ? (
              <TraceSlot projectId={projectId} traceId={traceId} {...(searchQuery ? { searchQuery } : {})} />
            ) : null
          }
          issueSlot={detailKind === "issue" ? <IssueSlot projectId={projectId} issueId={issueId} /> : null}
        />
      )}
    </DetailDrawer>
  )
}
