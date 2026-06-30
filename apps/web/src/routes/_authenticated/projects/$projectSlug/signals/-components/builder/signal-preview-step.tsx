import type { SignalPreviewResult } from "@domain/evaluations"
import { Badge, Button, Icon, Skeleton, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ExternalLinkIcon, RotateCwIcon } from "lucide-react"

type PreviewRow = Extract<SignalPreviewResult, { status: "done" }>["items"][number]

function PreviewRowItem({ row, projectSlug }: { readonly row: PreviewRow; readonly projectSlug: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="shrink-0">
        {row.error !== null ? (
          <Badge variant="muted">errored</Badge>
        ) : row.passed === true ? (
          <Badge variant="success">match</Badge>
        ) : (
          <Badge variant="destructive">no match</Badge>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {row.value !== null ? <Text.H6 color="foregroundMuted">value: {row.value}</Text.H6> : null}
        <Text.H6 ellipsis noWrap>
          {row.error ?? row.feedback ?? ""}
        </Text.H6>
      </div>
      <Link
        to="/projects/$projectSlug"
        params={{ projectSlug }}
        search={{ traceId: row.traceId, sessionId: row.sessionId }}
        className="shrink-0"
      >
        <Button variant="ghost" size="icon" aria-label="View trace">
          <Icon icon={ExternalLinkIcon} size="sm" />
        </Button>
      </Link>
    </div>
  )
}

/**
 * Step 3 — runs the preview on entry (the parent owns the result + loading state)
 * and renders one row per matched session. The user can advance without waiting.
 */
export function SignalPreviewStep({
  result,
  isRunning,
  onRun,
  projectSlug,
}: {
  readonly result: SignalPreviewResult | null
  readonly isRunning: boolean
  readonly onRun: () => void
  readonly projectSlug: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">Latest matching sessions, evaluated with the current detector.</Text.H6>
        <Button variant="outline" size="sm" onClick={onRun} disabled={isRunning} isLoading={isRunning}>
          <Icon icon={RotateCwIcon} size="sm" />
          Run again
        </Button>
      </div>
      {isRunning ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : result === null || result.status === "pending" ? (
        <Text.H6 color="foregroundMuted">Run a preview to see how the detector scores recent sessions.</Text.H6>
      ) : result.status === "error" ? (
        <Text.H6 color="destructive">{result.error}</Text.H6>
      ) : result.items.length === 0 ? (
        <Text.H6 color="foregroundMuted">No recent sessions match.</Text.H6>
      ) : (
        <div className="flex flex-col gap-2">
          {result.items.map((row) => (
            <PreviewRowItem key={`${row.sessionId}:${row.traceId}`} row={row} projectSlug={projectSlug} />
          ))}
        </div>
      )}
    </div>
  )
}
