import { Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import type { ReactNode } from "react"
import { useSignalDetail, useSignalImpact } from "../../../../../../../domains/signals/signals.collection.ts"
import { SignalDrawerEvaluations } from "../../-components/signal-drawer-evaluations.tsx"
import { formatSeenAgeParts } from "../../-components/signal-formatters.ts"

const MICROCENTS_PER_DOLLAR = 100_000_000

/** Comfortable content width the evaluations component was built for (≈ the
 * 520px drawer minus padding); keeps it from wrapping when squeezed or looking
 * stranded when stretched edge-to-edge. */
const EVALUATIONS_PANEL_WIDTH = "xl:w-[500px]"

/** Signal's share of all project traces, with `<1%` for a tiny-but-present rate. */
const formatPercent = (fraction: number) => {
  if (fraction <= 0) return "0%"
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

/** A single impact metric, sized like the issues-list analytics tiles. */
function Tile({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
    </div>
  )
}

function SeenTile({
  label,
  iso,
  relative,
}: {
  readonly label: string
  readonly iso: string | null
  readonly relative: string
}) {
  return (
    <Tile label={label}>
      {iso ? (
        <Tooltip asChild trigger={<Text.H5 color="foreground">{relative}</Text.H5>}>
          {new Date(iso).toLocaleString()}
        </Tooltip>
      ) : (
        <Text.H5 color="foregroundMuted">{relative}</Text.H5>
      )}
    </Tile>
  )
}

/**
 * Top-of-page report band, laid out as two side-by-side `bg-secondary` panels
 * that mirror the page's Trend + Patterns row:
 *
 * - **Impact** (`flex-1`): the headline metrics as a tile strip that grows to
 *   fill the row, matching the issues-list analytics panel.
 * - **Evaluations** (fixed ~500px): the issue-evaluations component at its native
 *   width, so it neither wraps (too narrow) nor stretches (too wide).
 *
 * Triage (assignee / priority) and the resolve/ignore lifecycle live in the
 * page header, tracker-style. "Affected users" is hidden when there's no user
 * attribution (count 0).
 */
export function SignalSummary({ projectId, signalId }: { readonly projectId: string; readonly signalId: string }) {
  const { data: issue, isLoading } = useSignalDetail({ projectId, signalId })
  const { data: impact, isLoading: impactLoading } = useSignalImpact({ projectId, signalId })
  const seen = issue ? formatSeenAgeParts(issue.lastSeenAt, issue.firstSeenAt) : null
  const showUsers = impactLoading || (impact !== undefined && impact.affectedUsers > 0)

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
      {/* Impact — headline metrics that fill the wide side of the row. */}
      <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 xl:flex-1">
        <Text.H6 color="foregroundMuted">Impact</Text.H6>
        <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
          <Tile label="Occurrences">
            {isLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <Text.H5 color="foreground">{issue ? formatCount(issue.totalOccurrences) : "-"}</Text.H5>
            )}
          </Tile>

          {isLoading || !issue || !seen ? (
            <>
              <Tile label="First seen">
                <Skeleton className="h-5 w-20" />
              </Tile>
              <Tile label="Last seen">
                <Skeleton className="h-5 w-20" />
              </Tile>
            </>
          ) : (
            <>
              <SeenTile label="First seen" iso={issue.firstSeenAt} relative={seen.firstSeenLabel} />
              <SeenTile label="Last seen" iso={issue.lastSeenAt} relative={seen.lastSeenLabel} />
            </>
          )}

          <Tile label="Affected traces">
            {impactLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : impact ? (
              <Tooltip
                asChild
                trigger={
                  <div className="flex cursor-default flex-row items-baseline gap-1">
                    <Text.H5 color="foreground">{formatCount(impact.affectedTraces)}</Text.H5>
                    <Text.H6 color="foregroundMuted">· {formatPercent(impact.affectedTracesPercent)}</Text.H6>
                  </div>
                }
              >
                {formatPercent(impact.affectedTracesPercent)} of all project traces are part of this signal — the
                baseline the Patterns section compares against.
              </Tooltip>
            ) : (
              <Text.H5 color="foreground">-</Text.H5>
            )}
          </Tile>

          <Tile label="Affected sessions">
            {impactLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <Text.H5 color="foreground">{impact ? formatCount(impact.affectedSessions) : "-"}</Text.H5>
            )}
          </Tile>

          {showUsers ? (
            <Tile label="Affected users">
              {impactLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <Text.H5 color="foreground">{impact ? formatCount(impact.affectedUsers) : "-"}</Text.H5>
              )}
            </Tile>
          ) : null}

          <Tile label="Cost impact">
            {impactLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <Text.H5 color="foreground">
                {impact ? formatPrice(impact.costMicrocents / MICROCENTS_PER_DOLLAR) : "-"}
              </Text.H5>
            )}
          </Tile>
        </div>
      </div>

      {/* Evaluations — kept at its native width so it renders like the drawer. */}
      <div className={`flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 xl:shrink-0 ${EVALUATIONS_PANEL_WIDTH}`}>
        <Text.H6 color="foregroundMuted">Evaluations</Text.H6>
        <SignalDrawerEvaluations
          projectId={projectId}
          signalId={signalId}
          signalSource={issue?.source ?? "annotation"}
          signalOrigin={issue?.origin ?? "system"}
          evaluations={issue?.evaluations ?? []}
          flaggerSlugs={issue?.flaggerSlugs ?? []}
          canMonitorSignal={issue ? issue.resolvedAt === null && issue.ignoredAt === null : false}
          isSignalLoading={isLoading}
        />
      </div>
    </div>
  )
}
