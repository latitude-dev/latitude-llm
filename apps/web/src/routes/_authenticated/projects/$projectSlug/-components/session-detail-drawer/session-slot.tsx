import type { FilterSet } from "@domain/shared"
import { CopyableText, Icon, ProviderIcon, Status, type TabOption, Tabs, Text, Tooltip } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { GroupIcon, ListTreeIcon, MessageSquareIcon, MessagesSquareIcon, ShieldAlertIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useAnnotationsBySession } from "../../../../../../domains/annotations/annotations.collection.ts"
import { deriveSessionStatus, useSessionIssues } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"
import { SpansTab } from "../trace-detail-drawer/tabs/spans-tab.tsx"
import { AnnotationsTab } from "./annotations-tab.tsx"
import { ConversationTab } from "./conversation-tab.tsx"
import { IssuesTab } from "./issues-tab.tsx"
import { MetadataTab } from "./metadata-tab.tsx"
import { SessionStatusPill } from "./session-status-pill.tsx"

export type SessionTabId = "session" | "conversation" | "spans" | "annotations" | "issues"

export function isSessionTab(value: string): value is SessionTabId {
  return (
    value === "session" ||
    value === "conversation" ||
    value === "spans" ||
    value === "annotations" ||
    value === "issues"
  )
}

const tabCountPillClass =
  "inline-flex min-h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium leading-none text-muted-foreground tabular-nums"

function countSuffix(count: number) {
  if (count <= 0) return null
  return <span className={tabCountPillClass}>{count}</span>
}

export function SessionSlot({
  projectId,
  session,
  traces,
  latestTraceId,
  activeTab,
  onActiveTabChange,
  onOpenTrace,
  onOpenIssue,
  onOpenInConversation,
  searchQuery,
  filters,
  onFiltersChange,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly latestTraceId: string
  readonly activeTab: SessionTabId
  readonly onActiveTabChange: (tab: SessionTabId) => void
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
  readonly onOpenIssue: (issueId: string) => void
  readonly onOpenInConversation: (annotationId: string) => void
  readonly searchQuery?: string
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: ((filters: FilterSet) => void) | undefined
}) {
  const traceIds = session.traceIds

  // A single-trace session can surface its spans inline
  const singleTrace = traces.length === 1 ? traces[0] : undefined
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")
  const effectiveActiveTab: SessionTabId = activeTab === "spans" && !singleTrace ? "session" : activeTab
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<SessionTabId>>(() => new Set([effectiveActiveTab]))

  // TODO(frontend-use-effect-policy): visited-set is an accumulator over a
  // sequence of activeTab changes; can't be derived from current props alone.
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(effectiveActiveTab) ? prev : new Set([...prev, effectiveActiveTab])))
  }, [effectiveActiveTab])

  function selectTab(tab: SessionTabId) {
    onActiveTabChange(tab)
  }

  // Badge counts. Both queries are shared (same key) with the tab panes, so
  // mounting a tab doesn't refetch.
  const { data: annotationsData } = useAnnotationsBySession({
    projectId,
    traceIds,
  })
  const { data: issues } = useSessionIssues({ projectId, traceIds })
  const annotationCount = annotationsData?.items.length ?? 0
  const issueCount = issues?.length ?? 0

  const traceNumberById = useMemo(() => {
    const map = new Map<string, number>()
    for (let index = 0; index < traces.length; index++) {
      const trace = traces[index]
      if (trace) map.set(trace.traceId, index + 1)
    }
    return map
  }, [traces])

  const tabs = useMemo<TabOption<SessionTabId>[]>(() => {
    const all: TabOption<SessionTabId>[] = [
      {
        id: "session",
        label: "Session",
        icon: <Icon icon={GroupIcon} size="sm" />,
      },
      {
        id: "conversation",
        label: "Conversation",
        icon: <Icon icon={MessagesSquareIcon} size="sm" />,
      },
    ]
    if (singleTrace) {
      all.push({
        id: "spans",
        label: "Spans",
        icon: <Icon icon={ListTreeIcon} size="sm" />,
        suffix: countSuffix(singleTrace.spanCount),
      })
    }
    all.push(
      {
        id: "annotations",
        label: "Annotations",
        icon: <Icon icon={MessageSquareIcon} size="sm" />,
        suffix: countSuffix(annotationCount),
      },
      {
        id: "issues",
        label: "Issues",
        icon: <Icon icon={ShieldAlertIcon} size="sm" />,
        suffix: countSuffix(issueCount),
      },
    )
    return all
  }, [annotationCount, issueCount, singleTrace])

  const title = session.rootSpanName || session.sessionId.slice(0, 12)
  const status = deriveSessionStatus(session.endTime)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-5 border-b px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <Text.H4 ellipsis noWrap>
              {title}
            </Text.H4>
            {session.providers.length > 0 && (
              <div className="flex items-center gap-1">
                {session.providers.map((p) => (
                  <Tooltip
                    key={p}
                    asChild
                    trigger={
                      <span>
                        <ProviderIcon provider={p} size="sm" />
                      </span>
                    }
                  >
                    {p}
                  </Tooltip>
                ))}
              </div>
            )}
            <SessionStatusPill status={status} lastActivity={relativeTime(new Date(session.endTime))} />
            {session.errorCount > 0 ? (
              <Status
                variant="destructive"
                indicator={false}
                label={`${formatCount(session.errorCount)} ${session.errorCount === 1 ? "error" : "errors"}`}
              />
            ) : null}
          </div>
          <CopyableText
            value={session.sessionId}
            displayValue={session.sessionId.slice(0, 7)}
            size="sm"
            tooltip="Copy session ID"
          />
        </div>
        <Tabs options={tabs} active={effectiveActiveTab} onSelect={selectTab} wrap />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {effectiveActiveTab === "session" && (
          <MetadataTab
            session={session}
            {...(filters ? { filters } : {})}
            {...(onFiltersChange ? { onFiltersChange } : {})}
          />
        )}
        {visitedTabs.has("conversation") && (
          <div className={effectiveActiveTab === "conversation" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <ConversationTab
              projectId={projectId}
              latestTraceId={latestTraceId}
              isActive={effectiveActiveTab === "conversation"}
              {...(searchQuery ? { searchQuery } : {})}
            />
          </div>
        )}
        {singleTrace && visitedTabs.has("spans") && (
          <div className={effectiveActiveTab === "spans" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <SpansTab
              projectId={projectId}
              traceId={singleTrace.traceId}
              selectedSpanId={selectedSpanId}
              onSelectSpan={setSelectedSpanId}
              isActive={effectiveActiveTab === "spans"}
            />
          </div>
        )}
        {visitedTabs.has("annotations") && (
          <div className={effectiveActiveTab === "annotations" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <AnnotationsTab
              projectId={projectId}
              traceIds={traceIds}
              latestTraceId={latestTraceId}
              traceNumberById={traceNumberById}
              onOpenInConversation={onOpenInConversation}
              onOpenTrace={onOpenTrace}
            />
          </div>
        )}
        {visitedTabs.has("issues") && (
          <div className={effectiveActiveTab === "issues" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <IssuesTab projectId={projectId} traceIds={traceIds} onOpenIssue={onOpenIssue} />
          </div>
        )}
      </div>
    </div>
  )
}
