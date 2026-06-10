import { Skeleton, TagBadge, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, WrenchIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  type ToolsTimeRange,
  useToolContextBreakdown,
  useToolCoOccurrence,
} from "../../../../../../../domains/tools/tools.collection.ts"
import { formatPercent } from "../../-components/tool-formatters.ts"

const MAX_ROWS_PER_SECTION = 5

function CoverageBar({ fraction }: { readonly fraction: number }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded bg-muted">
      <div
        className="absolute inset-y-0 left-0 rounded bg-primary/70"
        style={{ width: `${Math.min(100, Math.max(2, fraction * 100))}%` }}
      />
    </div>
  )
}

function BreakdownRow({
  identity,
  fraction,
  tooltip,
}: {
  readonly identity: ReactNode
  readonly fraction: number
  readonly tooltip: ReactNode
}) {
  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-row items-center">{identity}</div>
            <Text.H6 color="foreground" className="shrink-0 font-semibold tabular-nums">
              {formatPercent(fraction)}
            </Text.H6>
          </div>
          <CoverageBar fraction={fraction} />
        </div>
      }
    >
      {tooltip}
    </Tooltip>
  )
}

/**
 * "Where it's used": tag breakdown over the tool's calls, plus the tools it
 * most often shares traces with — each co-occurring tool links to its own
 * page. (Model/provider breakdowns deliberately omitted: most projects run a
 * single model, and the traces filter answers that question better.)
 */
export function ToolContextPanel({
  projectId,
  projectSlug,
  toolName,
  range,
  toolTracesUsed,
  errorsOnly,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  /** Denominator: the tool's traces (failing traces in errors mode). */
  readonly toolTracesUsed: number
  readonly errorsOnly: boolean
}) {
  const { data: tagRows = [], isLoading: tagsLoading } = useToolContextBreakdown({
    projectId,
    toolName,
    dimension: "tag",
    range,
    errorsOnly,
  })
  const { data: coOccurrence = [], isLoading: coOccurrenceLoading } = useToolCoOccurrence({
    projectId,
    toolName,
    range,
    errorsOnly,
  })
  const tracesNoun = errorsOnly ? "traces where it failed" : "traces calling it"

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-y-auto rounded-lg bg-secondary p-4 xl:max-h-[420px] xl:w-[340px]">
      <Text.H6 color="foregroundMuted">{errorsOnly ? "Where it fails" : "Where it's used"}</Text.H6>
      {coOccurrenceLoading ? (
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted">Often used with</Text.H6>
          <Skeleton className="h-5 w-full" />
        </div>
      ) : coOccurrence.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Often used with</Text.H6>
          {coOccurrence.map((row) => {
            const fraction = toolTracesUsed > 0 ? row.sharedTraces / toolTracesUsed : 0
            return (
              <Link
                key={row.otherTool}
                to="/projects/$projectSlug/tools/$toolName"
                params={{ projectSlug, toolName: row.otherTool }}
                className="group -mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-background"
              >
                <BreakdownRow
                  identity={
                    <div className="flex min-w-0 flex-row items-center gap-1.5">
                      <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <Text.H6
                        color="foreground"
                        className="truncate font-mono underline-offset-2 group-hover:underline"
                      >
                        {row.otherTool}
                      </Text.H6>
                      <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  }
                  fraction={fraction}
                  tooltip={
                    <span>
                      {formatCount(row.sharedTraces)} of the {formatCount(toolTracesUsed)} {tracesNoun} also call{" "}
                      <span className="font-mono">{row.otherTool}</span>
                      {errorsOnly ? " (its own calls are not necessarily failing)" : ""}. Click to open it.
                    </span>
                  }
                />
              </Link>
            )
          })}
        </div>
      ) : null}
      {tagsLoading ? (
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted">Tags</Text.H6>
          <Skeleton className="h-5 w-full" />
        </div>
      ) : tagRows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted">Tags</Text.H6>
          {tagRows.slice(0, MAX_ROWS_PER_SECTION).map((row) => {
            const fraction = toolTracesUsed > 0 ? row.traces / toolTracesUsed : 0
            return (
              <BreakdownRow
                key={row.value}
                identity={<TagBadge tag={row.value} />}
                fraction={fraction}
                tooltip={
                  <span>
                    {formatCount(row.traces)} of the {formatCount(toolTracesUsed)} {tracesNoun} carry the {row.value}{" "}
                    tag.
                  </span>
                }
              />
            )
          })}
        </div>
      ) : null}
      {!coOccurrenceLoading && !tagsLoading && coOccurrence.length === 0 && tagRows.length === 0 ? (
        <Text.H6 color="foregroundMuted">
          {errorsOnly
            ? "No co-occurring tools or tags on failed calls in this window."
            : "No co-occurring tools or tags in this window."}
        </Text.H6>
      ) : null}
    </div>
  )
}
