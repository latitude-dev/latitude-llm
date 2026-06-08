import { MOMENT_KINDS, type MomentKind } from "@domain/conversation-intelligence"
import {
  BarChart,
  Button,
  cn,
  DetailDrawer,
  HistogramSkeleton,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Skeleton,
  Tabs,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, FlameIcon, MinusIcon, SparklesIcon, TagIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import {
  type BehaviourSegment,
  useBehaviourSessions,
  useClusterProfile,
} from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type {
  BehaviourNodeRecord,
  BehaviourSessionFilter,
  BehaviourSessionRecord,
  BehaviourTimeRangeRecord,
} from "../../../../../../domains/taxonomy/taxonomy.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { SessionDetailDrawer } from "../../-components/session-detail-drawer.tsx"
import { BehavioursTrajectoryChart } from "./behaviours-trajectory-chart.tsx"

const segmentOptions: ReadonlyArray<{ readonly id: BehaviourSegment; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "new_this_week", label: "New this week" },
  { id: "spiking", label: "Spiking" },
]

interface BehaviourTableRow {
  readonly node: BehaviourNodeRecord
  readonly depth: number
  readonly hasChildren: boolean
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString()
const signalLabel = (kind: string) => kind.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase())

const trendLabel = (status: BehaviourNodeRecord["trend"]["status"]): string => {
  switch (status) {
    case "new":
      return "new"
    case "spike":
      return "spiking"
    case "rising":
      return "rising"
    case "steady":
      return "steady"
    case "cooling":
      return "cooling"
    case "fading":
      return "fading"
  }
}

const trendIcon = (status: BehaviourNodeRecord["trend"]["status"]) => {
  switch (status) {
    case "new":
      return SparklesIcon
    case "spike":
    case "rising":
      return status === "spike" ? FlameIcon : ArrowUpIcon
    case "cooling":
    case "fading":
      return ArrowDownIcon
    case "steady":
      return MinusIcon
  }
}

const trendRank = (status: BehaviourNodeRecord["trend"]["status"]): number => {
  switch (status) {
    case "new":
      return 6
    case "spike":
      return 5
    case "rising":
      return 4
    case "steady":
      return 3
    case "cooling":
      return 2
    case "fading":
      return 1
  }
}

/**
 * Interior nodes hold only residue observations, so their own trend can be
 * misleading; the subtree's strongest trend represents the topic.
 */
const subtreeTrendStatus = (node: BehaviourNodeRecord): BehaviourNodeRecord["trend"]["status"] => {
  let dominant = node.trend.status
  for (const child of node.children) {
    const childStatus = subtreeTrendStatus(child)
    if (trendRank(childStatus) > trendRank(dominant)) dominant = childStatus
  }
  return dominant
}

function BehaviourBadge({ label, icon }: { readonly label: string; readonly icon: typeof TagIcon }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-xs leading-5 text-muted-foreground">
      <Icon icon={icon} size="xs" color="foregroundMuted" />
      <span className="truncate">{label}</span>
    </span>
  )
}

function BehaviourNameCell({
  row,
  expanded,
  onToggle,
}: {
  readonly row: BehaviourTableRow
  readonly expanded: boolean
  readonly onToggle: () => void
}) {
  return (
    <div className="flex min-w-0 items-start gap-1" style={{ paddingLeft: `${row.depth * 20}px` }}>
      {row.hasChildren ? (
        <button
          type="button"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${row.node.cluster.name}`}
          aria-expanded={expanded}
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted/60"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          <Icon
            icon={ChevronRightIcon}
            size="xs"
            color="foregroundMuted"
            className={cn("transition-transform", expanded ? "rotate-90" : "rotate-0")}
          />
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          {row.depth === 0 ? <Icon icon={TagIcon} size="sm" color="foregroundMuted" /> : null}
          <Text.H5 noWrap ellipsis>
            {row.node.cluster.name}
          </Text.H5>
        </div>
        {row.node.cluster.description ? (
          <Text.H6 color="foregroundMuted" noWrap ellipsis>
            {row.node.cluster.description}
          </Text.H6>
        ) : null}
      </div>
    </div>
  )
}

export function BehaviourDetailDrawer({
  node,
  parentName,
  projectId,
  timeRange,
  onClose,
}: {
  readonly node: BehaviourNodeRecord
  readonly parentName: string | null
  readonly projectId: string
  readonly timeRange: BehaviourTimeRangeRecord | undefined
  readonly onClose: () => void
}) {
  const cluster = node.cluster
  const [sessionFilter, setSessionFilter] = useState<BehaviourSessionFilter>("all")
  const [sessionOverlayId, setSessionOverlayId] = useState<string | null>(null)
  const [sessionOverlayMomentId, setSessionOverlayMomentId] = useState<string | null>(null)
  const [sessionPanelEntered, setSessionPanelEntered] = useState(false)
  const { data: intelligence } = useClusterProfile(projectId, cluster.id, timeRange)
  const {
    data: behaviourSessionsData,
    isLoading: behaviourSessionsLoading,
    fetchNextPage: fetchNextBehaviourSessionsPage,
    hasNextPage: hasNextBehaviourSessionsPage,
    isFetchingNextPage: isFetchingNextBehaviourSessionsPage,
  } = useBehaviourSessions(projectId, cluster.id, sessionFilter, timeRange)
  const behaviourSessions = behaviourSessionsData?.pages.flatMap((page) => page.sessions) ?? []
  const behaviourSessionHistogram = behaviourSessionsData?.pages[0]?.histogram ?? []
  const detectedSignals = intelligence?.topMoments ?? []
  const sessionFilterOptions = detectedSignals
    .filter((signal): signal is { readonly kind: MomentKind; readonly count: number } =>
      (MOMENT_KINDS as readonly string[]).includes(signal.kind),
    )
    .filter((signal) => signal.count > 0)
    .map((signal) => ({
      id: signal.kind satisfies BehaviourSessionFilter,
      label: signalLabel(signal.kind),
      valueText: formatCount(signal.count),
    }))
  useEffect(() => {
    setSessionFilter("all")
    setSessionOverlayId(null)
    setSessionPanelEntered(false)
  }, [cluster.id, timeRange])

  const openSessionOverlay = (session: BehaviourSessionRecord) => {
    setSessionOverlayId(session.sessionId)
    setSessionOverlayMomentId(session.momentId || null)
    requestAnimationFrame(() => setSessionPanelEntered(true))
  }
  const closeSessionOverlay = () => {
    setSessionPanelEntered(false)
    setTimeout(() => {
      setSessionOverlayId(null)
    }, 300)
  }

  return (
    <>
      <DetailDrawer storeKey="behaviour-detail-drawer-width" onClose={onClose}>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {parentName ? <BehaviourBadge label={parentName} icon={TagIcon} /> : null}
              <BehaviourBadge label={`${formatCount(node.subtreeSessionCount)} sessions`} icon={TagIcon} />
              <BehaviourBadge label={trendLabel(node.trend.status)} icon={trendIcon(node.trend.status)} />
              <BehaviourBadge label={`First seen ${node.firstSeenLabel.replaceAll("_", " ")}`} icon={SparklesIcon} />
            </div>
            <div className="flex flex-col gap-2">
              <Text.H2>{cluster.name}</Text.H2>
              <Text.H5 color="foregroundMuted">
                {cluster.description || "This behaviour has not been named in detail yet."}
              </Text.H5>
              <Text.H6 color="foregroundMuted">
                First seen {formatDate(cluster.firstObservedAt)} · Last seen{" "}
                {relativeTime(new Date(cluster.lastObservedAt))}
              </Text.H6>
            </div>
          </div>

          <section className="flex flex-col gap-4 border-border border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <Text.H4>Conversation intelligence</Text.H4>
                <Text.H6 color="foregroundMuted">
                  Conversation intelligence summarizes session outcomes, detected signals, and activity patterns for
                  this behaviour.
                </Text.H6>
              </div>
            </div>
            {intelligence ? (
              <div className="flex flex-col gap-4">
                <BehaviourSessionsHistogram isLoading={behaviourSessionsLoading} buckets={behaviourSessionHistogram} />
                {detectedSignals.length > 1 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <DetectedSignalsChart signals={detectedSignals} />
                  </div>
                ) : null}
                {sessionFilterOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sessionFilterOptions.map((option) => (
                      <MetricButton
                        key={option.id}
                        active={sessionFilter === option.id}
                        label={option.label}
                        valueText={option.valueText}
                        onClick={() => setSessionFilter((current) => (current === option.id ? "all" : option.id))}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Text.H5>Associated sessions</Text.H5>
                  </div>
                  <Text.H6 color="foregroundMuted">
                    {sessionFilter === "all"
                      ? "All sessions for this behaviour"
                      : `Sessions matching ${sessionFilter.replaceAll("_", " ")}`}
                  </Text.H6>
                  {behaviourSessionsLoading ? (
                    <Skeleton className="h-16 rounded-xl" />
                  ) : behaviourSessions.length ? (
                    <BehaviourSessionsTable
                      sessions={behaviourSessions}
                      activeSessionId={sessionOverlayId ?? undefined}
                      onSessionClick={openSessionOverlay}
                      hasMore={hasNextBehaviourSessionsPage === true}
                      isLoadingMore={isFetchingNextBehaviourSessionsPage}
                      onLoadMore={() => void fetchNextBehaviourSessionsPage()}
                    />
                  ) : (
                    <Text.H5 color="foregroundMuted">No sessions match this filter.</Text.H5>
                  )}
                </div>
              </div>
            ) : (
              <Text.H5 color="foregroundMuted">Conversation intelligence is not available yet.</Text.H5>
            )}
          </section>
        </div>
      </DetailDrawer>
      {sessionOverlayId !== null ? (
        <>
          <button
            type="button"
            aria-label="Close session panel"
            className={cn(
              "fixed inset-0 z-[45] bg-foreground/10 transition-opacity duration-200",
              sessionPanelEntered ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={closeSessionOverlay}
          />
          <div
            className={cn(
              "fixed inset-y-0 right-0 z-[50] flex max-h-dvh shadow-2xl will-change-transform transition-transform duration-300 ease-out",
              sessionPanelEntered ? "translate-x-0" : "translate-x-full",
            )}
          >
            <SessionDetailDrawer
              key={sessionOverlayId}
              projectId={projectId}
              sessionId={sessionOverlayId}
              onClose={closeSessionOverlay}
              defaultTab="conversation"
              focusMomentKind={sessionFilter === "all" ? undefined : sessionFilter}
              focusMomentId={sessionOverlayMomentId ?? undefined}
            />
          </div>
        </>
      ) : null}
    </>
  )
}

function BehaviourSessionsTable({
  sessions,
  activeSessionId,
  onSessionClick,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  readonly sessions: readonly BehaviourSessionRecord[]
  readonly activeSessionId: string | undefined
  readonly onSessionClick: (session: BehaviourSessionRecord) => void
  readonly hasMore: boolean
  readonly isLoadingMore: boolean
  readonly onLoadMore: () => void
}) {
  const columns = useMemo(
    (): InfiniteTableColumn<BehaviourSessionRecord>[] => [
      {
        key: "startTime",
        header: "Start Time",
        width: 150,
        render: (session) => (
          <Tooltip asChild trigger={<span className="truncate">{relativeTime(new Date(session.endTime))}</span>}>
            {new Date(session.endTime).toLocaleString()}
          </Tooltip>
        ),
      },
      {
        key: "moment",
        header: "Moment",
        width: 260,
        render: (session) => session.summary || session.sessionId,
      },
      {
        key: "signals",
        header: "Detected signals",
        width: 220,
        render: (session) =>
          session.momentKinds.length > 0 ? session.momentKinds.join(", ").replaceAll("_", " ") : "no detected signals",
      },
      {
        key: "sessionId",
        header: "Session ID",
        width: 180,
        render: (session) => session.sessionId,
      },
    ],
    [],
  )

  return (
    <ProjectStyleTableFrame>
      <InfiniteTable
        data={sessions}
        columns={columns}
        getRowKey={(session) => session.sessionId}
        onRowClick={onSessionClick}
        getRowAriaLabel={(session) => `Open session ${session.sessionId} in the session panel`}
        rowInteractionRole="button"
        {...(activeSessionId ? { activeRowKey: activeSessionId } : {})}
        scrollAreaLayout="intrinsic"
        className="max-h-[min(28rem,50vh)]"
        infiniteScroll={{ hasMore, isLoadingMore, onLoadMore }}
        blankSlate="No sessions match this filter."
      />
    </ProjectStyleTableFrame>
  )
}

function ProjectStyleTableFrame({ children }: { readonly children: ReactNode }) {
  return <div className="overflow-hidden">{children}</div>
}

function MetricButton({
  active,
  label,
  valueText,
  onClick,
}: {
  readonly active: boolean
  readonly label: string
  readonly valueText: string
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-w-0 items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-left hover:bg-muted/40",
        active ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20",
      )}
      onClick={onClick}
    >
      <Text.H6 noWrap ellipsis>
        {label}
      </Text.H6>
      <Text.H6 color={active ? "foreground" : "foregroundMuted"}>{valueText}</Text.H6>
    </button>
  )
}

const signalChartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--success))",
  "hsl(var(--warning-muted-foreground))",
] as const

const polarToCartesian = (center: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180
  return {
    x: center + radius * Math.cos(angleInRadians),
    y: center + radius * Math.sin(angleInRadians),
  }
}

const describePieSlice = (center: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(center, radius, endAngle)
  const end = polarToCartesian(center, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1"
  return [
    `M ${center} ${center}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ")
}

function DetectedSignalsChart({
  signals,
}: {
  readonly signals: readonly { readonly kind: string; readonly count: number }[]
}) {
  const visibleSignals = signals.filter((signal) => signal.count > 0).slice(0, 4)
  const total = visibleSignals.reduce((sum, signal) => sum + signal.count, 0)
  let cursor = 0
  const slices = visibleSignals.map((signal, index) => {
    const startAngle = cursor
    const endAngle = cursor + (signal.count / total) * 360
    cursor = endAngle
    return { signal, startAngle, endAngle, color: signalChartColors[index % signalChartColors.length] }
  })

  return (
    <div className="flex items-center justify-center gap-5">
      <svg className="size-40 shrink-0" viewBox="0 0 160 160" role="img" aria-label="Detected signal distribution">
        <circle cx="80" cy="80" r="78" className="fill-muted" />
        {slices.map((slice) => (
          <Tooltip
            key={slice.signal.kind}
            asChild
            trigger={
              <path
                d={describePieSlice(80, 78, slice.startAngle, slice.endAngle)}
                fill={slice.color}
                className="cursor-default outline-none transition-opacity hover:opacity-80 focus:opacity-80"
                tabIndex={0}
              />
            }
          >
            {`${slice.signal.kind.replaceAll("_", " ")}: ${formatCount(slice.signal.count)} sessions`}
          </Tooltip>
        ))}
      </svg>
      <div className="flex min-w-0 flex-col gap-1">
        <Text.H6 color="foregroundMuted">Detected signals</Text.H6>
        {visibleSignals.map((signal, index) => (
          <div key={signal.kind} className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: signalChartColors[index % signalChartColors.length] }}
            />
            <Text.H6 noWrap ellipsis>
              {signal.kind.replaceAll("_", " ")} · {formatCount(signal.count)}
            </Text.H6>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatSessionHistogramLabel(startTime: string) {
  const date = new Date(startTime)
  return date.toLocaleDateString([], { month: "short", day: "numeric" }).replace(" ", " ")
}

function formatSessionHistogramTooltip(startTime: string, count: number) {
  const date = new Date(startTime)
  const label = date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  return `${label}<br/><b>${formatCount(count)}</b> sessions`
}

function BehaviourSessionsHistogram({
  isLoading,
  buckets,
}: {
  readonly isLoading: boolean
  readonly buckets: readonly { readonly startTime: string; readonly count: number }[]
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const data = useMemo(
    () =>
      buckets.map((bucket) => ({
        category: formatSessionHistogramLabel(bucket.startTime),
        value: bucket.count,
        tooltipCategory: bucket.startTime,
      })),
    [buckets],
  )

  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <div className="flex items-center justify-between gap-3 px-2 py-2">
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Session activity</Text.H6>
          <Text.H5 className="tabular-nums">{formatCount(total)} sessions</Text.H5>
        </div>
      </div>
      {isLoading ? (
        <div className="px-2 py-3">
          <HistogramSkeleton height={140} />
        </div>
      ) : data.length === 0 || data.every((bucket) => bucket.value === 0) ? (
        <div className="flex min-h-[80px] items-center justify-center px-2 py-3">
          <Text.H6 color="foregroundMuted">No sessions in this time window</Text.H6>
        </div>
      ) : (
        <div className="px-2 py-3">
          <BarChart
            data={data}
            height={140}
            showYAxis={false}
            xAxisLabelFontSize={10}
            ariaLabel="Behaviour sessions over time"
            formatTooltip={(category, value) => formatSessionHistogramTooltip(category, value)}
          />
        </div>
      )}
    </div>
  )
}

export function BehavioursView({
  topics,
  projectId,
  isLoading,
  segment,
  activeBehaviourId,
  timeFilter,
  timeRange,
  onSegmentChange,
  onActiveBehaviourChange,
}: {
  readonly topics: readonly BehaviourNodeRecord[]
  readonly projectId: string
  readonly isLoading: boolean
  readonly segment: BehaviourSegment
  readonly activeBehaviourId: string | undefined
  readonly timeFilter: ReactNode
  readonly timeRange: BehaviourTimeRangeRecord | undefined
  readonly onSegmentChange: (segment: BehaviourSegment) => void
  readonly onActiveBehaviourChange: (behaviourId: string | undefined) => void
}) {
  const expandableKeys = useMemo(() => {
    const keys = new Set<string>()
    const walk = (nodes: readonly BehaviourNodeRecord[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) keys.add(node.cluster.id)
        walk(node.children)
      }
    }
    walk(topics)
    return keys
  }, [topics])
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(new Set())
  // The drill path lives in the URL with push-history semantics so the
  // browser back/forward buttons step through chart selections instead of
  // leaving the page.
  const [dotChartPathParam, setDotChartPathParam] = useParamState("behaviourPath", "", { history: "push" })
  const dotChartPath: readonly string[] = useMemo(
    () => (dotChartPathParam ? dotChartPathParam.split(".") : []),
    [dotChartPathParam],
  )

  // Chart clicks drive the table selection too: the path tail becomes the
  // active behaviour (highlighted row + detail drawer). Clearing the path
  // closes the drawer.
  const handleDotChartPathChange = useCallback(
    (path: readonly string[]) => {
      setDotChartPathParam(path.join("."))
      onActiveBehaviourChange(path.length > 0 ? path[path.length - 1] : undefined)
    },
    [setDotChartPathParam, onActiveBehaviourChange],
  )

  // The dot chart selection narrows the table to the deepest *drilled*
  // subtree. A selected leaf at the path tail only drives the behaviour
  // selection — its siblings stay visible rather than filtering the table
  // down to a single row. A stale path (e.g. after a segment change drops
  // the node) falls back to the full tree instead of an empty table.
  const tableTopics: readonly BehaviourNodeRecord[] = useMemo(() => {
    let nodes = topics
    let subtreeRoot: BehaviourNodeRecord | undefined
    for (const id of dotChartPath) {
      const node = nodes.find((candidate) => candidate.cluster.id === id)
      if (!node) return topics
      if (node.children.length > 0) {
        subtreeRoot = node
        nodes = node.children
      }
    }
    return subtreeRoot ? [subtreeRoot] : topics
  }, [topics, dotChartPath])

  // The visible rows are a depth-first walk that stops at collapsed nodes.
  const rows: readonly BehaviourTableRow[] = useMemo(() => {
    const out: BehaviourTableRow[] = []
    const walk = (nodes: readonly BehaviourNodeRecord[], depth: number) => {
      for (const node of nodes) {
        out.push({ node, depth, hasChildren: node.children.length > 0 })
        if (node.children.length > 0 && !collapsedKeys.has(node.cluster.id)) walk(node.children, depth + 1)
      }
    }
    walk(tableTopics, 0)
    return out
  }, [tableTopics, collapsedKeys])

  const activeAncestorKeys = useMemo(() => {
    const keys = new Set<string>()
    const walk = (nodes: readonly BehaviourNodeRecord[], ancestors: readonly string[]): boolean => {
      for (const node of nodes) {
        if (node.cluster.id === activeBehaviourId) {
          for (const ancestor of ancestors) keys.add(ancestor)
          return true
        }
        if (walk(node.children, [...ancestors, node.cluster.id])) return true
      }
      return false
    }
    if (activeBehaviourId) walk(topics, [])
    return keys
  }, [activeBehaviourId, topics])

  useEffect(() => {
    if (activeAncestorKeys.size === 0) return
    setCollapsedKeys((previous) => {
      const next = new Set([...previous].filter((key) => !activeAncestorKeys.has(key)))
      return next.size === previous.size ? previous : next
    })
  }, [activeAncestorKeys])

  const activeIndex = activeBehaviourId ? rows.findIndex((row) => row.node.cluster.id === activeBehaviourId) : -1

  const setActiveByOffset = useCallback(
    (offset: number) => {
      const next = rows[activeIndex + offset]
      if (next) onActiveBehaviourChange(next.node.cluster.id)
      else if (activeIndex === -1 && rows[0]) onActiveBehaviourChange(rows[0].node.cluster.id)
    },
    [activeIndex, rows, onActiveBehaviourChange],
  )

  useHotkeys([
    { hotkey: "J", callback: () => setActiveByOffset(1) },
    { hotkey: "K", callback: () => setActiveByOffset(-1) },
  ])

  const toggleNode = useCallback(
    (key: string) => {
      if (!expandableKeys.has(key)) return
      setCollapsedKeys((previous) => {
        const next = new Set(previous)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    },
    [expandableKeys],
  )

  const columns: InfiniteTableColumn<BehaviourTableRow>[] = [
    {
      key: "behaviour",
      header: "Behaviour",
      width: 420,
      minWidth: 300,
      render: (row) => (
        <BehaviourNameCell
          row={row}
          expanded={!collapsedKeys.has(row.node.cluster.id)}
          onToggle={() => toggleNode(row.node.cluster.id)}
        />
      ),
    },
    {
      key: "sessions",
      header: "Sessions",
      width: 110,
      align: "end",
      render: (row) => formatCount(row.node.subtreeSessionCount),
    },
    {
      key: "signals",
      header: "Signals",
      width: 240,
      render: (row) => {
        const signals = row.node.intelligence.signals.filter((signal) => signal.rate > 0)
        if (signals.length === 0) return <Text.H5 color="foregroundMuted">-</Text.H5>
        return <TagList tags={signals.map((signal) => signalLabel(signal.kind))} />
      },
    },
    {
      key: "trend",
      header: "Trend",
      width: 130,
      render: (row) => {
        const status = row.hasChildren ? subtreeTrendStatus(row.node) : row.node.trend.status
        return <BehaviourBadge label={trendLabel(status)} icon={trendIcon(status)} />
      },
    },
    {
      key: "seen",
      header: "First seen",
      width: 170,
      render: (row) => {
        const firstObservedAt = row.node.cluster.firstObservedAt
        return (
          <Tooltip asChild trigger={<span>{relativeTime(new Date(firstObservedAt))}</span>}>
            <div className="flex flex-col gap-1">
              <Text.H6 color="foregroundMuted">First seen</Text.H6>
              <Text.H6B>{formatDate(firstObservedAt)}</Text.H6B>
              <Text.H6 color="foregroundMuted">Last seen</Text.H6>
              <Text.H6B>{new Date(row.node.cluster.lastObservedAt).toLocaleString()}</Text.H6B>
            </div>
          </Tooltip>
        )
      },
    },
  ]

  return (
    <>
      <Layout.Actions>
        <Layout.ActionsRow>
          <Layout.ActionRowItem>
            {timeFilter}
            <Tabs
              variant="bordered"
              size="sm"
              options={segmentOptions.map((option) => ({ id: option.id, label: option.label }))}
              active={segment}
              onSelect={(value) => onSegmentChange(value)}
            />
            {dotChartPath.length > 0 ? (
              // Resets the drill filter without touching the behaviour selection.
              <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={() => setDotChartPathParam("")}>
                Clear filter
              </Button>
            ) : null}
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
      </Layout.Actions>
      <Layout.Body>
        <Layout.List className="gap-3">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-6">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : (
            <>
              <BehavioursTrajectoryChart
                projectId={projectId}
                topics={topics}
                selectedPath={dotChartPath}
                timeRange={timeRange}
                onSelectPath={handleDotChartPathChange}
              />
              <InfiniteTable
                {...listingLayoutIntrinsicScroll.infiniteTable}
                data={rows}
                isLoading={false}
                columns={columns}
                getRowKey={(row) => row.node.cluster.id}
                getRowAriaLabel={(row) =>
                  row.node.cluster.id === activeBehaviourId
                    ? `Close ${row.node.cluster.name}`
                    : `Open ${row.node.cluster.name}`
                }
                onRowClick={(row) => {
                  // Selecting a parent row also reveals its nested group; the
                  // chevron stays the only way to collapse it back.
                  if (row.hasChildren) {
                    setCollapsedKeys((previous) => {
                      if (!previous.has(row.node.cluster.id)) return previous
                      const next = new Set(previous)
                      next.delete(row.node.cluster.id)
                      return next
                    })
                  }
                  onActiveBehaviourChange(row.node.cluster.id === activeBehaviourId ? undefined : row.node.cluster.id)
                }}
                {...(activeBehaviourId ? { activeRowKey: activeBehaviourId, activeRowAutoScroll: true } : {})}
                blankSlate="No behaviours match the current filters"
              />
            </>
          )}
        </Layout.List>
      </Layout.Body>
    </>
  )
}
