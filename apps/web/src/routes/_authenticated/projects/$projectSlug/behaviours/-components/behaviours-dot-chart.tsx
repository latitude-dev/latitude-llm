import { Button, cn, Icon, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ChartScatter, ChevronDown, ChevronRightIcon, ChevronUp } from "lucide-react"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import type { BehaviourNodeRecord } from "../../../../../../domains/taxonomy/taxonomy.functions.ts"

const MIN_DOT_DIAMETER_PX = 18
const MAX_DOT_DIAMETER_PX = 64
/** Satellites scale with their subtree's session count within this range. */
const SATELLITE_MIN_RADIUS_PX = 3.5
const SATELLITE_MAX_RADIUS_PX = 7
const SATELLITE_LINE_WIDTH_PX = 2
/**
 * Visible length of the connecting line between the parent's edge and
 * each satellite's near edge. Satellites grow *outward* from that fixed
 * near edge so a heavy satellite never creeps back into its parent.
 */
const SATELLITE_LINE_LENGTH_PX = 8
/** Decorative preview only — more would turn big clusters into dandelions. */
const MAX_SATELLITES = 6
/** How far satellites (line + full dot + stroke) reach past the parent's edge. */
const SATELLITE_EXTENT_PX = SATELLITE_LINE_LENGTH_PX + SATELLITE_MAX_RADIUS_PX * 2 + 1
/**
 * The dot layer is inset from the canvas by the largest possible dot
 * radius plus its satellite halo, so a dot centered on the layer's edge
 * can never be clipped by the canvas border.
 */
const DOT_LAYER_INSET_PX = MAX_DOT_DIAMETER_PX / 2 + SATELLITE_EXTENT_PX + 2
const GOLDEN_ANGLE_RADIANS = 2.399963229728653

const DOT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--success)",
  "var(--warning-muted-foreground)",
] as const

interface ChartPoint {
  readonly x: number
  readonly y: number
}

/**
 * Square-root scaling keeps dot *area* proportional to the session count
 * relative to the largest node at the visible level.
 */
const dotDiameterPx = (sessionCount: number, maxSessionCount: number): number => {
  if (maxSessionCount <= 0) return MIN_DOT_DIAMETER_PX
  const ratio = Math.sqrt(Math.max(sessionCount, 1) / maxSessionCount)
  return Math.round(MIN_DOT_DIAMETER_PX + ratio * (MAX_DOT_DIAMETER_PX - MIN_DOT_DIAMETER_PX))
}

/** Deterministic golden-angle spiral for nodes the PCA could not place. */
const fallbackPosition = (index: number): ChartPoint => {
  const angle = index * GOLDEN_ANGLE_RADIANS
  const radius = 0.18 + 0.27 * Math.min(1, Math.sqrt((index + 1) / 12))
  return { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) }
}

interface VisibleLevel {
  /** Drilled-into ancestors, outermost first. */
  readonly trail: readonly BehaviourNodeRecord[]
  /** Dots currently on the canvas: children of the deepest drilled node. */
  readonly nodes: readonly BehaviourNodeRecord[]
  /** Leaf at the path tail (selected without being drillable), if any. */
  readonly selectedLeafId: string | null
}

const resolveVisibleLevel = (topics: readonly BehaviourNodeRecord[], path: readonly string[]): VisibleLevel => {
  const trail: BehaviourNodeRecord[] = []
  let nodes = topics
  let selectedLeafId: string | null = null
  for (const id of path) {
    const node = nodes.find((candidate) => candidate.cluster.id === id)
    if (!node) break
    if (node.children.length > 0) {
      trail.push(node)
      nodes = node.children
    } else {
      selectedLeafId = node.cluster.id
    }
  }
  return { trail, nodes, selectedLeafId }
}

/**
 * Normalize the visible points' bounding box to [0, 1] dot-layer
 * fractions. Degenerate ranges center on 0.5 so a lone dot (or perfectly
 * aligned dots) never divides by zero. Clipping safety is handled in
 * pixels by the inset dot layer, not here.
 */
const fitToViewport = (points: readonly ChartPoint[]): ((point: ChartPoint) => ChartPoint) => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  const scale = (value: number, min: number, max: number): number => {
    const range = max - min
    return range < 1e-9 ? 0.5 : (value - min) / range
  }
  return (point) => ({ x: scale(point.x, minX, maxX), y: scale(point.y, minY, maxY) })
}

interface ChartDotEntry {
  readonly node: BehaviourNodeRecord
  readonly point: ChartPoint
  readonly diameter: number
  readonly color: string
}

interface Satellite {
  readonly angle: number
  readonly radius: number
}

/**
 * One satellite per child (capped): angled toward the child's real
 * position in the projected embedding space — the mini-constellation
 * previews where children will fan out on drill — and sized by the
 * child's subtree session count relative to its heaviest sibling (sqrt
 * scale, so area tracks weight). Children without a usable direction
 * fall back to golden-angle spacing.
 */
const satellitesFor = (node: BehaviourNodeRecord): readonly Satellite[] => {
  const children = node.children.slice(0, MAX_SATELLITES)
  const maxSessionCount = children.reduce((max, child) => Math.max(max, child.subtreeSessionCount), 0)
  return children.map((child, index) => {
    const ratio = maxSessionCount > 0 ? Math.sqrt(Math.max(child.subtreeSessionCount, 1) / maxSessionCount) : 1
    const radius = SATELLITE_MIN_RADIUS_PX + ratio * (SATELLITE_MAX_RADIUS_PX - SATELLITE_MIN_RADIUS_PX)
    if (node.position && child.position) {
      const dx = child.position.x - node.position.x
      const dy = child.position.y - node.position.y
      if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) return { angle: Math.atan2(dy, dx), radius }
    }
    return { angle: index * GOLDEN_ANGLE_RADIANS, radius }
  })
}

function DotSatellites({
  node,
  diameter,
  color,
}: {
  readonly node: BehaviourNodeRecord
  readonly diameter: number
  readonly color: string
}) {
  const extent = SATELLITE_EXTENT_PX
  const size = diameter + extent * 2
  const center = size / 2
  const parentRadius = diameter / 2
  // Every satellite's near edge sits at the end of the fixed-length line;
  // its center moves outward with its own radius so weight grows the dot
  // away from the parent, never into it.
  const nearEdgeRadius = parentRadius + SATELLITE_LINE_LENGTH_PX
  return (
    <svg
      role="presentation"
      aria-hidden
      width={size}
      height={size}
      className="pointer-events-none absolute transition-transform duration-300 ease-out group-hover:scale-105"
      style={{ inset: -extent }}
    >
      {satellitesFor(node).map((satellite, index) => {
        const cos = Math.cos(satellite.angle)
        const sin = Math.sin(satellite.angle)
        return (
          <g key={index}>
            {/* Stop at the satellite's near edge — its fill is translucent,
                so a line running to the center would show through. */}
            <line
              x1={center + (parentRadius - 1) * cos}
              y1={center + (parentRadius - 1) * sin}
              x2={center + nearEdgeRadius * cos}
              y2={center + nearEdgeRadius * sin}
              stroke={`hsl(${color} / 0.5)`}
              strokeWidth={SATELLITE_LINE_WIDTH_PX}
            />
            <circle
              cx={center + (nearEdgeRadius + satellite.radius) * cos}
              cy={center + (nearEdgeRadius + satellite.radius) * sin}
              r={satellite.radius}
              fill={`hsl(${color} / 0.55)`}
              stroke={`hsl(${color})`}
              strokeWidth={1}
            />
          </g>
        )
      })}
    </svg>
  )
}

const dotAriaLabel = (node: BehaviourNodeRecord, selected: boolean): string =>
  node.children.length > 0
    ? `Drill into ${node.cluster.name}`
    : selected
      ? `Deselect ${node.cluster.name}`
      : `Select ${node.cluster.name} and filter the table to it`

function DotTooltipContent({ node, selected }: { readonly node: BehaviourNodeRecord; readonly selected: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Text.H6B>{node.cluster.name}</Text.H6B>
      <Text.H6 color="foregroundMuted">{formatCount(node.subtreeSessionCount)} sessions</Text.H6>
      <Text.H6 color="foregroundMuted">
        {node.children.length > 0
          ? `Click to drill into ${formatCount(node.children.length)} sub-behaviours`
          : selected
            ? "Click to deselect"
            : "Click to filter the table to this behaviour"}
      </Text.H6>
    </div>
  )
}

type DotPhase = "enter" | "active"

interface AnimatedDot {
  readonly entry: ChartDotEntry
  /** Current render position — the enter origin until the FLIP flips. */
  readonly point: ChartPoint
  readonly phase: DotPhase
}

function ChartDot({
  entry,
  point,
  zIndex,
  selected,
  onClick,
}: {
  readonly entry: ChartDotEntry
  /** Where to render right now — the enter origin until the FLIP flips. */
  readonly point: ChartPoint
  readonly zIndex: number
  readonly selected: boolean
  readonly onClick: () => void
}) {
  const { node, diameter, color } = entry
  const childCount = node.children.length
  return (
    <Tooltip
      asChild
      trigger={
        <button
          type="button"
          aria-pressed={selected}
          aria-label={dotAriaLabel(node, selected)}
          className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer outline-none transition-[left,top] duration-[250ms] ease-[cubic-bezier(0.34,1.25,0.64,1)] hover:!z-50 focus-visible:!z-50"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, zIndex }}
          onClick={onClick}
        >
          <span className="relative block">
            <span
              className={cn(
                "block rounded-full border-2 transition-[width,height,box-shadow] duration-[250ms] ease-[cubic-bezier(0.34,1.25,0.64,1)] group-focus-visible:ring-2 group-focus-visible:ring-primary/50",
                selected ? "shadow-[0_0_0_4px_hsl(var(--primary)/0.25)]" : "group-hover:brightness-110",
              )}
              style={{
                width: diameter,
                height: diameter,
                borderColor: `hsl(${color})`,
                background: `hsl(${color} / 0.35)`,
              }}
            />
            {childCount > 0 ? <DotSatellites node={node} diameter={diameter} color={color} /> : null}
          </span>
        </button>
      }
    >
      <DotTooltipContent node={node} selected={selected} />
    </Tooltip>
  )
}

function ChartLegend({
  entries,
  selectedLeafId,
  onEntryClick,
}: {
  readonly entries: readonly ChartDotEntry[]
  readonly selectedLeafId: string | null
  readonly onEntryClick: (node: BehaviourNodeRecord) => void
}) {
  return (
    <div className="hidden max-h-72 w-56 shrink-0 flex-col gap-0.5 overflow-y-auto @[36rem]:flex">
      {entries.map((entry) => {
        const selected = entry.node.cluster.id === selectedLeafId
        return (
          <button
            key={entry.node.cluster.id}
            type="button"
            aria-pressed={selected}
            aria-label={dotAriaLabel(entry.node, selected)}
            className={cn(
              "flex min-w-0 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/50",
              selected && "bg-muted/60",
            )}
            onClick={() => onEntryClick(entry.node)}
          >
            <span className="size-2.5 shrink-0 rounded-full border" style={{ background: `hsl(${entry.color})` }} />
            <span className="min-w-0 flex-1 truncate text-foreground text-xs leading-5">{entry.node.cluster.name}</span>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {formatCount(entry.node.subtreeSessionCount)}
            </span>
            {entry.node.children.length > 0 ? (
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 2D map of the behaviour taxonomy. Each dot is a cluster positioned by
 * its centroid embedding projected to 2D (PCA, server-side), so
 * semantically similar behaviours sit close together. Dot area is
 * proportional to session count; drillable dots carry a sub-behaviour
 * count chip. Roots show by default; clicking a dot drills into its
 * children (re-fitting the viewport to that region of the embedding
 * space) down to the deepest leaves, and filters the table below to the
 * selected subtree. A side legend names the dots and collapses when the
 * panel is narrow. The whole panel collapses to a slim header row, like
 * the statistics panel on the traces list.
 */
export function BehavioursDotChart({
  topics,
  selectedPath,
  onSelectPath,
}: {
  readonly topics: readonly BehaviourNodeRecord[]
  readonly selectedPath: readonly string[]
  readonly onSelectPath: (path: readonly string[]) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { trail, nodes, selectedLeafId } = useMemo(
    () => resolveVisibleLevel(topics, selectedPath),
    [topics, selectedPath],
  )

  const dots: readonly ChartDotEntry[] = useMemo(() => {
    const positioned = nodes.map((node, index) => ({
      node,
      point: node.position ?? fallbackPosition(index),
    }))
    const toViewport = fitToViewport(positioned.map((entry) => entry.point))
    const maxSessionCount = nodes.reduce((max, node) => Math.max(max, node.subtreeSessionCount), 0)
    return (
      positioned
        .map((entry, index) => ({
          node: entry.node,
          point: toViewport(entry.point),
          diameter: dotDiameterPx(entry.node.subtreeSessionCount, maxSessionCount),
          color: DOT_COLORS[index % DOT_COLORS.length],
        }))
        // Render big dots first so small neighbours stay clickable on top;
        // the legend reads in the same prominence order.
        .sort((a, b) => b.diameter - a.diameter)
    )
  }, [nodes])

  // -------------------------------------------------------------------
  // Level-change choreography (FLIP): when the visible set is swapped,
  // outgoing dots leave immediately while incoming dots spawn at the
  // clicked parent's position (captured in `enterOriginRef`) and fan out
  // to their fitted spots one frame later.
  // -------------------------------------------------------------------
  const levelKey = trail.length > 0 ? trail[trail.length - 1].cluster.id : "__root__"
  const enterOriginRef = useRef<ChartPoint | null>(null)
  const previousLevelKeyRef = useRef<string | null>(null)
  const [animatedDots, setAnimatedDots] = useState<readonly AnimatedDot[]>([])

  useEffect(() => {
    const previousLevelKey = previousLevelKeyRef.current
    previousLevelKeyRef.current = levelKey
    if (previousLevelKey === levelKey) {
      // Same level (selection toggle or data refetch): track positions
      // without re-running the enter dance.
      setAnimatedDots(dots.map((entry) => ({ entry, point: entry.point, phase: "active" as const })))
      return
    }
    const origin = enterOriginRef.current
    enterOriginRef.current = null
    setAnimatedDots(dots.map((entry) => ({ entry, point: origin ?? entry.point, phase: "enter" as const })))
    // Double rAF so the browser paints the origin frame before the flip.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatedDots((previous) =>
          previous.map((dot) => (dot.phase === "enter" ? { ...dot, point: dot.entry.point, phase: "active" } : dot)),
        )
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [dots, levelKey])

  if (topics.length === 0) return null

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col rounded-lg bg-secondary">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Icon icon={ChartScatter} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Behaviour map</Text.H6>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} aria-label="Expand behaviour map">
            <Icon icon={ChevronDown} size="sm" />
          </Button>
        </div>
      </div>
    )
  }

  const trailIds = trail.map((node) => node.cluster.id)
  const handleDotClick = (node: BehaviourNodeRecord) => {
    if (node.children.length > 0) {
      // Children fan out from where the clicked dot currently sits.
      enterOriginRef.current = dots.find((dot) => dot.node.cluster.id === node.cluster.id)?.point ?? null
      onSelectPath([...trailIds, node.cluster.id])
      return
    }
    onSelectPath(selectedLeafId === node.cluster.id ? trailIds : [...trailIds, node.cluster.id])
  }

  return (
    <div className="@container flex shrink-0 flex-col gap-2 rounded-lg bg-secondary p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <div className="flex shrink-0 items-center gap-1.5">
            <Icon icon={ChartScatter} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Behaviour map</Text.H6>
          </div>
          <span className="mx-1 h-3 w-px shrink-0 bg-border" />
          <button
            type="button"
            className={cn(
              "shrink-0 cursor-pointer rounded px-1 text-xs leading-5 hover:bg-muted/60",
              trail.length === 0 ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => onSelectPath([])}
          >
            All behaviours
          </button>
          {trail.map((node, index) => (
            <Fragment key={node.cluster.id}>
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className={cn(
                  "min-w-0 cursor-pointer truncate rounded px-1 text-xs leading-5 hover:bg-muted/60",
                  index === trail.length - 1 ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => onSelectPath(trailIds.slice(0, index + 1))}
              >
                {node.cluster.name}
              </button>
            </Fragment>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse behaviour map"
        >
          <Icon icon={ChevronUp} size="sm" />
        </Button>
      </div>
      <div className="flex min-w-0 gap-3">
        <div
          className="relative h-72 min-w-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-background/60"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border) / 0.7) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute" style={{ inset: DOT_LAYER_INSET_PX }}>
            {animatedDots.map((dot, index) => (
              <ChartDot
                key={dot.entry.node.cluster.id}
                entry={dot.entry}
                point={dot.point}
                zIndex={index + 1}
                selected={dot.entry.node.cluster.id === selectedLeafId}
                onClick={() => handleDotClick(dot.entry.node)}
              />
            ))}
          </div>
        </div>
        <ChartLegend entries={dots} selectedLeafId={selectedLeafId} onEntryClick={handleDotClick} />
      </div>
    </div>
  )
}
