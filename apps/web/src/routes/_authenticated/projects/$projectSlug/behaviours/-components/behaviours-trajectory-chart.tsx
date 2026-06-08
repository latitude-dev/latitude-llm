import { Button, cn, Icon, Tabs, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useBehaviourTrajectory } from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type {
  BehaviourNodeRecord,
  BehaviourTimeRangeRecord,
} from "../../../../../../domains/taxonomy/taxonomy.functions.ts"

type TrajectoryMetric = "frequency" | "escalation" | "resolution" | "churnRisk" | "wins"
type TrajectoryAxis = "day" | "turn"

const MAX_COLLAPSED_ROWS = 3
const MIN_BUBBLE_SIZE_PX = 4
const MAX_BUBBLE_SIZE_PX = 30
const ROW_HEIGHT_PX = 48
const MAX_TURN_BUCKETS = 14
const CHART_X_PADDING_PERCENT = 2.5

const metricOptions: ReadonlyArray<{ readonly id: TrajectoryMetric; readonly label: string }> = [
  { id: "frequency", label: "Frequency" },
  { id: "escalation", label: "Escalation" },
  { id: "resolution", label: "Resolution" },
  { id: "churnRisk", label: "Churn risk" },
  { id: "wins", label: "Wins" },
]

const rowColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--success))",
  "hsl(var(--warning-muted-foreground))",
] as const

interface VisibleLevel {
  readonly trail: readonly BehaviourNodeRecord[]
  readonly nodes: readonly BehaviourNodeRecord[]
}

const resolveVisibleLevel = (topics: readonly BehaviourNodeRecord[], path: readonly string[]): VisibleLevel => {
  const trail: BehaviourNodeRecord[] = []
  let nodes = topics
  for (const id of path) {
    const node = nodes.find((candidate) => candidate.cluster.id === id)
    if (!node) break
    if (node.children.length === 0) return { trail, nodes }
    trail.push(node)
    nodes = node.children
  }
  return { trail, nodes }
}

const bucketLabel = (bucket: string, axis: TrajectoryAxis): string => {
  if (axis === "turn") {
    const [start, end] = bucket.split(":").map((value) => Number(value))
    if (Number.isFinite(start) && Number.isFinite(end) && start !== end) return `Turns ${start + 1}-${end + 1}`
    if (Number.isFinite(start)) return `Turn ${start + 1}`
    return bucket
  }
  const [, month, day] = bucket.split("-")
  return month && day ? `${month}/${day}` : bucket
}

const niceTurnBucketSize = (rawBucketCount: number): number => {
  if (rawBucketCount <= MAX_TURN_BUCKETS) return 1
  const target = Math.ceil(rawBucketCount / MAX_TURN_BUCKETS)
  if (target <= 2) return 2
  if (target <= 5) return 5
  if (target <= 10) return 10
  if (target <= 20) return 20
  if (target <= 50) return 50
  return Math.ceil(target / 50) * 50
}

const coarsenTrajectoryRows = (
  rows: readonly {
    categoryClusterId: string
    bucket: string
    frequency: number
    escalation: number
    resolution: number
    churnRisk: number
    wins: number
    maxLastMessageIndex: number
    maxEscalationLastMessageIndex: number
    maxResolutionLastMessageIndex: number
    maxChurnRiskLastMessageIndex: number
    maxWinsLastMessageIndex: number
  }[],
  axis: TrajectoryAxis,
  metric: TrajectoryMetric,
) => {
  if (axis === "day") {
    return {
      rows,
      buckets: [...new Set(rows.map((row) => row.bucket))].sort((left, right) => left.localeCompare(right)),
    }
  }
  const metricRows = rows.filter((row) => metricValue(row, metric) > 0)
  const rawTurns = metricRows.map((row) => Number(row.bucket)).filter(Number.isFinite)
  if (rawTurns.length === 0) return { rows, buckets: [] }
  const minTurn = Math.min(...rawTurns)
  const matchingLastTurns = metricRows.map((row) => maxLastMessageIndexForMetric(row, metric)).filter(Number.isFinite)
  const maxTurn = Math.max(...rawTurns, ...matchingLastTurns)
  const bucketSize = niceTurnBucketSize(maxTurn - minTurn + 1)
  const coarsened = new Map<
    string,
    {
      categoryClusterId: string
      bucket: string
      frequency: number
      escalation: number
      resolution: number
      churnRisk: number
      wins: number
      maxLastMessageIndex: number
      maxEscalationLastMessageIndex: number
      maxResolutionLastMessageIndex: number
      maxChurnRiskLastMessageIndex: number
      maxWinsLastMessageIndex: number
    }
  >()
  for (const row of rows) {
    const turn = Number(row.bucket)
    if (!Number.isFinite(turn)) continue
    const start = minTurn + Math.floor((turn - minTurn) / bucketSize) * bucketSize
    const end = Math.min(start + bucketSize - 1, maxTurn)
    const bucket = `${start}:${end}`
    const key = `${row.categoryClusterId}:${bucket}`
    const current = coarsened.get(key) ?? {
      categoryClusterId: row.categoryClusterId,
      bucket,
      frequency: 0,
      escalation: 0,
      resolution: 0,
      churnRisk: 0,
      wins: 0,
      maxLastMessageIndex: 0,
      maxEscalationLastMessageIndex: 0,
      maxResolutionLastMessageIndex: 0,
      maxChurnRiskLastMessageIndex: 0,
      maxWinsLastMessageIndex: 0,
    }
    current.frequency += row.frequency
    current.escalation += row.escalation
    current.resolution += row.resolution
    current.churnRisk += row.churnRisk
    current.wins += row.wins
    current.maxLastMessageIndex = Math.max(current.maxLastMessageIndex, row.maxLastMessageIndex)
    current.maxEscalationLastMessageIndex = Math.max(
      current.maxEscalationLastMessageIndex,
      row.maxEscalationLastMessageIndex,
    )
    current.maxResolutionLastMessageIndex = Math.max(
      current.maxResolutionLastMessageIndex,
      row.maxResolutionLastMessageIndex,
    )
    current.maxChurnRiskLastMessageIndex = Math.max(
      current.maxChurnRiskLastMessageIndex,
      row.maxChurnRiskLastMessageIndex,
    )
    current.maxWinsLastMessageIndex = Math.max(current.maxWinsLastMessageIndex, row.maxWinsLastMessageIndex)
    coarsened.set(key, current)
  }
  const buckets = Array.from({ length: Math.ceil((maxTurn - minTurn + 1) / bucketSize) }, (_, index) => {
    const start = minTurn + index * bucketSize
    const end = Math.min(start + bucketSize - 1, maxTurn)
    return `${start}:${end}`
  })
  return { rows: [...coarsened.values()], buckets }
}

const metricValue = (
  row: { frequency: number; escalation: number; resolution: number; churnRisk: number; wins: number },
  metric: TrajectoryMetric,
) => row[metric]

const maxLastMessageIndexForMetric = (
  row: {
    maxLastMessageIndex: number
    maxEscalationLastMessageIndex: number
    maxResolutionLastMessageIndex: number
    maxChurnRiskLastMessageIndex: number
    maxWinsLastMessageIndex: number
  },
  metric: TrajectoryMetric,
) => {
  if (metric === "escalation") return row.maxEscalationLastMessageIndex
  if (metric === "resolution") return row.maxResolutionLastMessageIndex
  if (metric === "churnRisk") return row.maxChurnRiskLastMessageIndex
  if (metric === "wins") return row.maxWinsLastMessageIndex
  return row.maxLastMessageIndex
}

const bubbleSize = (count: number, maxCount: number): number => {
  if (count <= 0 || maxCount <= 0) return 0
  const ratio = Math.sqrt(count / maxCount)
  return MIN_BUBBLE_SIZE_PX + ratio * (MAX_BUBBLE_SIZE_PX - MIN_BUBBLE_SIZE_PX)
}

export function BehavioursTrajectoryChart({
  projectId,
  topics,
  selectedPath,
  timeRange,
  onSelectPath,
}: {
  readonly projectId: string
  readonly topics: readonly BehaviourNodeRecord[]
  readonly selectedPath: readonly string[]
  readonly timeRange: BehaviourTimeRangeRecord | undefined
  readonly onSelectPath: (path: readonly string[]) => void
}) {
  const [metric, setMetric] = useState<TrajectoryMetric>("frequency")
  const [axis, setAxis] = useState<TrajectoryAxis>("day")
  const [showAll, setShowAll] = useState(false)
  const visibleLevel = useMemo(() => resolveVisibleLevel(topics, selectedPath), [topics, selectedPath])
  const visibleNodes = showAll ? visibleLevel.nodes : visibleLevel.nodes.slice(0, MAX_COLLAPSED_ROWS)
  const visibleIds = visibleNodes.map((node) => node.cluster.id)
  const { data, isLoading } = useBehaviourTrajectory(projectId, visibleIds, axis, timeRange)
  const rawRows = data?.rows ?? []
  const trajectory = useMemo(() => coarsenTrajectoryRows(rawRows, axis, metric), [rawRows, axis, metric])
  const rows = trajectory.rows
  const buckets = trajectory.buckets
  const maxCount = Math.max(...rows.map((row) => metricValue(row, metric)), 0)
  const rowsByCategoryAndBucket = new Map(rows.map((row) => [`${row.categoryClusterId}:${row.bucket}`, row]))
  const chartHeight = Math.max(visibleNodes.length * ROW_HEIGHT_PX, ROW_HEIGHT_PX)
  const canGoBack = visibleLevel.trail.length > 0
  const currentPath = visibleLevel.trail.map((node) => node.cluster.id)

  return (
    <section className="rounded-xl border border-border/60 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Tabs
            variant="bordered"
            size="sm"
            options={metricOptions.map((option) => ({ id: option.id, label: option.label }))}
            active={metric}
            onSelect={(value) => setMetric(value)}
          />
        </div>
        <Tabs
          variant="bordered"
          size="sm"
          options={[
            { id: "day", label: "Days" },
            { id: "turn", label: "Turn" },
          ]}
          active={axis}
          onSelect={(value) => setAxis(value)}
        />
      </div>

      {canGoBack || visibleLevel.trail.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canGoBack ? (
            <Button variant="ghost" size="sm" onClick={() => onSelectPath(currentPath.slice(0, -1))}>
              <Icon icon={ChevronLeftIcon} size="xs" />
              Back
            </Button>
          ) : null}
          {visibleLevel.trail.map((node, index) => (
            <button
              type="button"
              key={node.cluster.id}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40"
              onClick={() => onSelectPath(currentPath.slice(0, index + 1))}
            >
              {index > 0 ? <Icon icon={ChevronRightIcon} size="xs" color="foregroundMuted" /> : null}
              <span className="max-w-36 truncate">{node.cluster.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-3">
        <div className="flex flex-col" style={{ height: chartHeight }}>
          {visibleNodes.map((node) => {
            const nextPath =
              node.children.length > 0 ? [...currentPath, node.cluster.id] : [...currentPath, node.cluster.id]
            return (
              <button
                type="button"
                key={node.cluster.id}
                className="flex min-w-0 cursor-pointer items-center justify-between gap-2 text-left hover:text-primary"
                style={{ height: ROW_HEIGHT_PX }}
                onClick={() => onSelectPath(nextPath)}
              >
                <Text.H6 noWrap ellipsis>
                  {node.cluster.name}
                </Text.H6>
                {node.children.length > 0 ? <Icon icon={ChevronRightIcon} size="xs" color="foregroundMuted" /> : null}
              </button>
            )
          })}
        </div>

        <div className="relative min-w-0 overflow-hidden border-border border-b" style={{ height: chartHeight }}>
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Text.H6 color="foregroundMuted">Loading trajectory…</Text.H6>
            </div>
          ) : buckets.length === 0 || visibleNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Text.H6 color="foregroundMuted">No detected moments in this window.</Text.H6>
            </div>
          ) : (
            <>
              {visibleNodes.map((node, rowIndex) => (
                <div
                  key={node.cluster.id}
                  className="absolute right-0 left-0 border-border/40 border-t first:border-t-0"
                  style={{ top: rowIndex * ROW_HEIGHT_PX, height: ROW_HEIGHT_PX }}
                />
              ))}
              {visibleNodes.map((node, rowIndex) =>
                buckets.map((bucket, bucketIndex) => {
                  const row = rowsByCategoryAndBucket.get(`${node.cluster.id}:${bucket}`)
                  const count = row ? metricValue(row, metric) : 0
                  if (count <= 0) return null
                  const size = bubbleSize(count, maxCount)
                  const left =
                    buckets.length === 1
                      ? 50
                      : CHART_X_PADDING_PERCENT +
                        (bucketIndex / (buckets.length - 1)) * (100 - CHART_X_PADDING_PERCENT * 2)
                  const top = rowIndex * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2
                  return (
                    <Tooltip
                      key={`${node.cluster.id}:${bucket}`}
                      asChild
                      trigger={
                        <button
                          type="button"
                          aria-label={`${node.cluster.name}: ${formatCount(count)} ${metric} moments at ${bucketLabel(bucket, axis)}`}
                          className={cn(
                            "absolute rounded-full animate-in fade-in-0 zoom-in-50 transition-all duration-300 ease-out hover:scale-110 hover:ring-2 hover:ring-primary/40 motion-reduce:animate-none motion-reduce:transition-none",
                          )}
                          style={{
                            width: size,
                            height: size,
                            left: `${left}%`,
                            top,
                            marginLeft: -size / 2,
                            marginTop: -size / 2,
                            backgroundColor: rowColors[rowIndex % rowColors.length],
                          }}
                          onClick={() => onSelectPath([...currentPath, node.cluster.id])}
                        />
                      }
                    >
                      <div className="flex flex-col gap-1">
                        <Text.H6B>{node.cluster.name}</Text.H6B>
                        <Text.H6 color="foregroundMuted">{bucketLabel(bucket, axis)}</Text.H6>
                        <Text.H6>{formatCount(count)} moments</Text.H6>
                      </div>
                    </Tooltip>
                  )
                }),
              )}
            </>
          )}
        </div>
      </div>

      {buckets.length > 0 ? (
        <div className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-3 pt-2">
          <span />
          <div className="relative h-5 text-muted-foreground text-xs">
            {buckets.map((bucket, index) => {
              const left = buckets.length === 1 ? 50 : (index / (buckets.length - 1)) * 100
              const show =
                buckets.length <= 6 ||
                index === 0 ||
                index === buckets.length - 1 ||
                index % Math.ceil(buckets.length / 4) === 0
              if (!show) return null
              return (
                <span
                  key={bucket}
                  className={cn(
                    "absolute whitespace-nowrap",
                    index === 0
                      ? "translate-x-0"
                      : index === buckets.length - 1
                        ? "-translate-x-full"
                        : "-translate-x-1/2",
                  )}
                  style={{ left: `${left}%` }}
                >
                  {bucketLabel(bucket, axis)}
                </span>
              )
            })}
          </div>
        </div>
      ) : null}

      {visibleLevel.nodes.length > MAX_COLLAPSED_ROWS ? (
        <div className="mt-3 grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-3">
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show less" : `+ Show ${visibleLevel.nodes.length - MAX_COLLAPSED_ROWS} more`}
          </Button>
          <span />
        </div>
      ) : null}
    </section>
  )
}
