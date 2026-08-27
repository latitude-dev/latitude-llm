import { Badge, cn, Icon, Text, type TextColor, Tooltip } from "@repo/ui"
import { ChevronRightIcon, TrendingUpIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import type { ScoreCause } from "./agent-score-mock.ts"
import { DestinationLink, MonitorLink } from "./destination-link.tsx"
import {
  BAR_TRACK,
  EVIDENCE_META,
  formatPoints,
  formatSessions,
  ROW_HOVER,
  SEVERITY_FILL,
  SEVERITY_META,
} from "./score-formatters.ts"

/** Renders `backticked` runs in mono so a tool name reads as a tool name. */
export function TextWithCode({
  text,
  size = "h5",
  color,
  truncate = false,
  clamp = false,
}: {
  readonly text: string
  readonly size?: "h5" | "h6"
  readonly color?: TextColor
  readonly truncate?: boolean
  /** Wraps to at most two lines rather than clipping the sentence. */
  readonly clamp?: boolean
}) {
  const segments = text.split("`").map((part, index) => ({ id: `${index}-${part}`, text: part, mono: index % 2 === 1 }))
  const body = (
    <span className={cn("min-w-0", { "flex-1": truncate })}>
      {segments.map((segment) =>
        segment.mono ? (
          <code key={segment.id} className="font-mono">
            {segment.text}
          </code>
        ) : (
          segment.text
        ),
      )}
    </span>
  )
  if (size === "h6") {
    return (
      <Text.H6 asChild ellipsis={truncate} {...(clamp ? { lineClamp: 2 as const } : {})} {...(color ? { color } : {})}>
        {body}
      </Text.H6>
    )
  }
  return (
    <Text.H5 asChild ellipsis={truncate} {...(clamp ? { lineClamp: 2 as const } : {})} {...(color ? { color } : {})}>
      {body}
    </Text.H5>
  )
}

export function SeverityDot({ severity }: { readonly severity: ScoreCause["severity"] }) {
  return (
    <Tooltip
      asChild
      trigger={
        <span className="inline-flex shrink-0 cursor-default">
          <span className={cn("size-2.5 rounded-full", SEVERITY_FILL[severity])} aria-hidden />
        </span>
      }
    >
      {SEVERITY_META[severity].hint}
    </Tooltip>
  )
}

/** Only rendered when a cause is growing: no glyph is the common case and needs no ink. */
export function GrowingMarker({ trend }: { readonly trend: ScoreCause["trend"] }) {
  if (trend !== "worse") return <span className="w-4 shrink-0" aria-hidden />
  return (
    <Tooltip
      asChild
      trigger={
        <span className="inline-flex w-4 shrink-0 cursor-default justify-center">
          <Icon icon={TrendingUpIcon} size="sm" className="text-rose-600 dark:text-rose-500" />
        </span>
      }
    >
      Growing since the previous snapshot
    </Tooltip>
  )
}

function ImpactBar({
  value,
  largest,
  severity,
}: {
  readonly value: number
  readonly largest: number
  readonly severity: ScoreCause["severity"]
}) {
  const fraction = largest <= 0 ? 0 : value / largest
  return (
    <Tooltip
      asChild
      trigger={
        <span className={cn("inline-flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full", BAR_TRACK)}>
          <span
            className={cn("h-full rounded-full", SEVERITY_FILL[severity])}
            style={{ width: `${Math.max(4, fraction * 100)}%` }}
          />
        </span>
      }
    >
      {`${formatPoints(value)} points, against the worst cause in this dimension`}
    </Tooltip>
  )
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-row items-center gap-3">
      <Text.H6 color="foregroundMuted" className="w-20 shrink-0" noWrap>
        {label}
      </Text.H6>
      <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function CauseRow({
  cause,
  projectSlug,
  dimensionDeficit,
  largestGain,
}: {
  readonly cause: ScoreCause
  readonly projectSlug: string
  readonly dimensionDeficit: number
  readonly largestGain: number
}) {
  const [expanded, setExpanded] = useState(false)
  const evidence = EVIDENCE_META[cause.evidence]
  const sharePercent = dimensionDeficit <= 0 || cause.share === null ? null : (cause.share / dimensionDeficit) * 100

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
        className={cn(
          "flex min-w-0 cursor-pointer flex-row items-center gap-2 rounded-md p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          ROW_HOVER,
        )}
      >
        <Icon
          icon={ChevronRightIcon}
          size="sm"
          color="foregroundMuted"
          className={cn("shrink-0 transition-transform", { "rotate-90": expanded })}
        />
        <SeverityDot severity={cause.severity} />
        <div className="flex min-w-0 flex-1 flex-row items-start gap-2">
          <TextWithCode text={cause.title} clamp />
          {cause.quickWin ? (
            <Badge variant="outlineSuccessMuted" size="small" className="shrink-0">
              Quick win
            </Badge>
          ) : null}
        </div>
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex shrink-0 cursor-default">
              <Text.H6 color="foregroundMuted" className="tabular-nums" noWrap>
                {formatSessions(cause.sessions)}
              </Text.H6>
            </span>
          }
        >
          Sessions this cause touched. They overlap, so the rows do not add up to the total.
        </Tooltip>
        {cause.gain === null ? null : <ImpactBar value={cause.gain} largest={largestGain} severity={cause.severity} />}
        <GrowingMarker trend={cause.trend} />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3">
          <TextWithCode text={cause.detail} size="h6" />
          <div className="flex flex-col gap-1.5">
            {cause.gain === null ? null : (
              <DetailRow label="Recovers">
                <Text.H6 className="tabular-nums" noWrap>
                  {`${formatPoints(cause.gain)} points`}
                </Text.H6>
                {sharePercent === null ? null : (
                  <Text.H6 color="foregroundMuted" noWrap>
                    {`${Math.round(sharePercent)}% of what this dimension lost`}
                  </Text.H6>
                )}
              </DetailRow>
            )}
            <DetailRow label="Sessions">
              <Text.H6 className="tabular-nums" noWrap>
                {formatSessions(cause.sessions)}
              </Text.H6>
              {cause.previousSessions === null ? null : (
                <Text.H6 color="foregroundMuted" noWrap>
                  {cause.previousSessions === cause.sessions
                    ? "flat on last week"
                    : `${cause.sessions > cause.previousSessions ? "up" : "down"} from ${formatSessions(cause.previousSessions)} last week`}
                </Text.H6>
              )}
            </DetailRow>
            {cause.costLabel === null ? null : (
              <DetailRow label="Spend">
                <Text.H6 noWrap>{cause.costLabel}</Text.H6>
              </DetailRow>
            )}
            <DetailRow label="Found by">
              <Tooltip
                asChild
                trigger={
                  <span className="inline-flex cursor-default">
                    <Badge variant={cause.evidence === "signal" ? "outlineAccent" : "outlineMuted"} size="small">
                      {evidence.label}
                    </Badge>
                  </span>
                }
              >
                {evidence.hint}
              </Tooltip>
            </DetailRow>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-4 border-t border-border pt-3">
            <DestinationLink projectSlug={projectSlug} destination={cause.destination} />
            {cause.evidence === "signal" ? null : <MonitorLink projectSlug={projectSlug} />}
          </div>
        </div>
      ) : null}
    </div>
  )
}
