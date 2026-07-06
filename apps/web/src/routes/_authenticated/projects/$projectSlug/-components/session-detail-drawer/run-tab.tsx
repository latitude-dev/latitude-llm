import { Icon, Skeleton, Status, Text } from "@repo/ui"
import type { LucideIcon } from "lucide-react"
import {
  BotIcon,
  CircleDashedIcon,
  ClipboardListIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react"
import { useMemo } from "react"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { useSpansBySessionCollection } from "../../../../../../domains/spans/spans.collection.ts"
import { useTraceConversationMessages, useTraceDetail } from "../../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import {
  buildCodemodeRunTimeline,
  type CodemodeRunNode,
  type CodemodeRunNodeKind,
} from "../../../../../../lib/codemode-run-timeline/build-codemode-run-timeline.ts"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"
import { formatDuration } from "../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"

const KIND_ICON: Record<CodemodeRunNodeKind, LucideIcon> = {
  plan: ClipboardListIcon,
  execute: TerminalIcon,
  innerTool: WrenchIcon,
  subagent: BotIcon,
  summarize: ScrollTextIcon,
  agent: MessageSquareIcon,
  unlabeled: CircleDashedIcon,
}

function RunRow({
  node,
  depth,
  onOpen,
}: {
  readonly node: CodemodeRunNode
  readonly depth: number
  readonly onOpen: (node: CodemodeRunNode) => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(node)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        <Icon icon={KIND_ICON[node.kind]} size="sm" color="foregroundMuted" className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text.H5 ellipsis noWrap>
            {node.label}
          </Text.H5>
          {node.hint ? (
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              {node.hint}
            </Text.H6>
          ) : null}
        </div>
        {node.kind === "unlabeled" ? (
          <Status variant="neutral" indicator={false} label="Unlabeled" className="shrink-0" />
        ) : null}
        <Text.H6 color="foregroundMuted" noWrap className="shrink-0">
          {formatDuration(node.durationMs)}
        </Text.H6>
        {node.isError ? <Status variant="destructive" indicator={false} label="error" className="shrink-0" /> : null}
      </button>
      {node.children.map((child) => (
        <RunRow key={child.id} node={child} depth={depth + 1} onOpen={onOpen} />
      ))}
    </>
  )
}

export function RunTab({
  projectId,
  session,
  traces,
  latestTraceId,
  onOpenTrace,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly latestTraceId: string
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
}) {
  const { data: spans, isLoading: isSpansLoading } = useSpansBySessionCollection({
    projectId,
    sessionId: session.sessionId,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  const { data: traceDetail } = useTraceDetail({ projectId, traceId: latestTraceId })
  const conversation = useTraceConversationMessages({
    projectId,
    traceId: latestTraceId,
    enabled: traceDetail != null,
  })

  const timeline = useMemo(() => {
    const messages =
      conversation.messages.length > 0 ? conversation.messages : [...session.inputMessages, ...session.outputMessages]
    return buildCodemodeRunTimeline({
      session: {
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        traceIds: session.traceIds,
      },
      traces,
      spans: spans ?? [],
      messages,
    })
  }, [
    session.sessionId,
    session.startTime,
    session.endTime,
    session.traceIds,
    session.inputMessages,
    session.outputMessages,
    traces,
    spans,
    conversation.messages,
  ])

  const openNode = (node: CodemodeRunNode) => {
    onOpenTrace(node.traceId, { spanId: node.spanId, targetTab: "spans" })
  }

  if (isSpansLoading && (spans?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col gap-3 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    )
  }

  if (timeline.turns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Text.H5 color="foregroundMuted">No run steps in this session.</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
      {timeline.turns.map((turn) => (
        <div key={turn.turnId} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 px-2">
            <Text.H6 color="foregroundMuted" noWrap>
              Turn {turn.turnIndex + 1}
            </Text.H6>
            <Text.H5 ellipsis noWrap>
              {turn.label}
            </Text.H5>
          </div>
          <div className="flex flex-col">
            {turn.nodes.map((node) => (
              <RunRow key={node.id} node={node} depth={0} onOpen={openNode} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
