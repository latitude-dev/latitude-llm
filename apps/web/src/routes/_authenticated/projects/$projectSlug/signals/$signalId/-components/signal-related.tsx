import { DetailSection, Icon, Skeleton, Status, Text, Tooltip } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { NetworkIcon } from "lucide-react"
import { useRelatedSignals } from "../../../../../../../domains/signals/signals.collection.ts"
import type { RelatedSignalRecord } from "../../../../../../../domains/signals/signals.functions.ts"
import { SignalLifecycleStatuses } from "../../-components/signal-lifecycle-statuses.tsx"

/**
 * Semantic score above which the chip reads "Very similar topic" instead of
 * "Similar topic". Purely presentational — the score itself is never shown.
 */
const VERY_SIMILAR_TOPIC_SCORE = 0.66

/** Integer percentage, with `<1%` for a tiny-but-present share so it never reads as 0%. */
const formatPercent = (fraction: number) => {
  if (fraction <= 0) return "0%"
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

/**
 * Reason chips state *why* the issue is related — a similar **topic**
 * (semantic centroid similarity) and/or shared **conversations** (session
 * co-occurrence). The raw similarity / relatedness numbers are deliberately
 * never shown (they rank, the chips explain). A card carrying both chips is
 * the "possibly the same issue" case and ranks above either signal alone.
 */
function ReasonChips({ row }: { readonly row: RelatedSignalRecord }) {
  return (
    <div className="flex min-w-0 flex-row flex-wrap items-center gap-1.5">
      {row.semantic ? (
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex">
              <Status
                variant="info"
                label={row.semantic.score >= VERY_SIMILAR_TOPIC_SCORE ? "Very similar topic" : "Similar topic"}
                indicator={false}
              />
            </span>
          }
        >
          Both issues describe similar failures. Their occurrences' feedback points at the same kind of problem.
        </Tooltip>
      ) : null}
      {row.coOccurrence ? (
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex">
              <Status
                variant="warning"
                label={`Same conversations · ${formatPercent(row.coOccurrence.sharedSessionsPercent)}`}
                indicator={false}
              />
            </span>
          }
        >
          Both issues occur in {formatCount(row.coOccurrence.sharedSessions)} of the same conversations over the last 30
          days ({formatPercent(row.coOccurrence.sharedSessionsPercent)} of this issue's sessions), more overlap than
          chance would predict.
        </Tooltip>
      ) : null}
    </div>
  )
}

function RelatedSignalCard({ projectSlug, row }: { readonly projectSlug: string; readonly row: RelatedSignalRecord }) {
  return (
    <Link
      to="/projects/$projectSlug/signals/$signalId"
      params={{ projectSlug, signalId: row.signalId }}
      aria-label={`Open the ${row.name} issue`}
      className="group flex flex-col gap-2 rounded-lg bg-secondary p-4 hover:bg-accent"
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        <Text.H5 className="min-w-0 flex-1 truncate group-hover:underline">{row.name}</Text.H5>
        <div className="shrink-0">
          <SignalLifecycleStatuses states={row.states} wrap={false} />
        </div>
      </div>
      <Text.H6 color="foregroundMuted" className="line-clamp-2 flex-1">
        {row.description}
      </Text.H6>
      <div className="flex flex-row items-end justify-between gap-2">
        <ReasonChips row={row} />
        <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap">
          {formatCount(row.occurrences)} occurrences
          {row.lastSeenAt ? ` · last seen ${relativeTime(new Date(row.lastSeenAt))}` : ""}
        </Text.H6>
      </div>
    </Link>
  )
}

/**
 * Related-issues section: one merged list combining two signals — semantic
 * similarity (centroid cosine) and session co-occurrence (NPMI) — ranked by a
 * fused relatedness score computed server-side. Rendered as a responsive card
 * grid at the bottom of the page; cards link to the related issue's page.
 * See `specs/signal-details-page.md` (Data model #3).
 */
export function SignalRelated({
  projectId,
  projectSlug,
  signalId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly signalId: string
}) {
  const { data: related, isLoading } = useRelatedSignals({ projectId, signalId })

  return (
    <DetailSection
      icon={<Icon icon={NetworkIcon} size="sm" />}
      label="Related issues"
      defaultOpen
      contentClassName="pl-0 max-h-none overflow-visible"
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map((cardIndex) => (
            <Skeleton key={cardIndex} className="h-28 w-full" />
          ))}
        </div>
      ) : !related || related.length === 0 ? (
        <Text.H6 color="foregroundMuted">
          No related issues found. Nothing with a similar topic, and nothing showing up in the same conversations.
        </Text.H6>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          {related.map((row) => (
            <RelatedSignalCard key={row.signalId} projectSlug={projectSlug} row={row} />
          ))}
        </div>
      )}
    </DetailSection>
  )
}
