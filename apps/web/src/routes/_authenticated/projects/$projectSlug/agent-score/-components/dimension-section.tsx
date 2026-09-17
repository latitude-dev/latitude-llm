import { Button, cn, Icon, Skeleton, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
} from "lucide-react"
import { useState } from "react"
import { FindingRow } from "../../-components/finding-row.tsx"
import type { DimensionEvidenceRow, EvidenceTone } from "./dimension-evidence.ts"
import { DimensionScoreRing } from "./score-ring.tsx"

const toneClasses: Record<EvidenceTone, string> = {
  negative: "text-destructive-muted-foreground",
  positive: "text-success-muted-foreground",
  neutral: "text-muted-foreground",
}

const toneIcon = (tone: EvidenceTone) =>
  tone === "negative" ? CircleAlertIcon : tone === "positive" ? CircleCheckIcon : CircleHelpIcon

const toneIconColor = (tone: EvidenceTone) =>
  tone === "negative"
    ? ("destructiveMutedForeground" as const)
    : tone === "positive"
      ? ("successMutedForeground" as const)
      : ("foregroundMuted" as const)

const DESTINATIONS = {
  tools: "/projects/$projectSlug/tools",
  memory: "/projects/$projectSlug/memory",
  cost: "/projects/$projectSlug/cost",
  signals: "/projects/$projectSlug/signals",
} as const

export const exampleSessionsSearch = (sessionIds: readonly string[]) => ({
  tab: "sessions",
  filters: JSON.stringify({ sessionId: [{ op: "in", value: [...sessionIds] }] }),
  filtersOpen: true,
})

function EvidenceRow({ row, projectSlug }: { readonly row: DimensionEvidenceRow; readonly projectSlug: string }) {
  const destination = row.destination && row.destination !== "sessions" ? DESTINATIONS[row.destination] : undefined
  const exampleSessionIds = row.exampleSessionIds ?? []
  const actionable = row.signalId !== undefined || destination !== undefined || exampleSessionIds.length > 0
  const content = (
    <FindingRow
      label={row.label}
      padded={false}
      leading={<Icon icon={toneIcon(row.tone)} size="sm" color={toneIconColor(row.tone)} />}
      trailing={
        <>
          <Text.H6 className={cn("shrink-0 tabular-nums", toneClasses[row.tone])} noWrap>
            {row.value}
          </Text.H6>
          {actionable ? <Icon icon={ChevronRightIcon} size="sm" color="foregroundMuted" /> : null}
        </>
      }
      className={cn("px-2", { "hover:bg-muted/60": actionable })}
    />
  )

  if (row.signalId) {
    return (
      <Link
        to="/projects/$projectSlug/signals/$signalSlug"
        params={{ projectSlug, signalSlug: row.signalId }}
        aria-label={row.label}
      >
        {content}
      </Link>
    )
  }
  if (destination) {
    return (
      <Link to={destination} params={{ projectSlug }} aria-label={row.label}>
        {content}
      </Link>
    )
  }
  if (exampleSessionIds.length > 0) {
    return (
      <Link
        to="/projects/$projectSlug"
        params={{ projectSlug }}
        search={exampleSessionsSearch(exampleSessionIds)}
        aria-label={`${row.label}, example sessions`}
      >
        {content}
      </Link>
    )
  }
  return content
}

function EvidenceGroup({
  id,
  label,
  rows,
  projectSlug,
  initiallyOpen,
  emptyMessage,
}: {
  readonly id: string
  readonly label: string
  readonly rows: readonly DimensionEvidenceRow[]
  readonly projectSlug: string
  readonly initiallyOpen: boolean
  readonly emptyMessage?: string
}) {
  const [open, setOpen] = useState(initiallyOpen)
  if (rows.length === 0 && !emptyMessage) return null

  return (
    <div className="flex flex-col">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-auto w-full justify-between gap-3 rounded-none border-b border-border bg-muted px-2 py-3 font-normal text-muted-foreground hover:bg-muted-foreground/10"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${label}, ${open ? "hide" : "show"}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="font-medium">{label}</span>
          <span className="flex flex-row items-center gap-1 text-muted-foreground">
            <Icon icon={open ? ChevronUpIcon : ChevronDownIcon} size="sm" />
            <span>{open ? "Hide" : "Show"}</span>
          </span>
        </button>
      </Button>
      {open ? (
        <div id={id} className="flex">
          {rows.length > 0 ? (
            <div className="flex w-full flex-col divide-y divide-border border-b border-border">
              {rows.map((row) => (
                <EvidenceRow key={row.id} row={row} projectSlug={projectSlug} />
              ))}
            </div>
          ) : (
            <div className="w-full border-b border-border px-2 py-4">
              <Text.H6 color="foregroundMuted">{emptyMessage}</Text.H6>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function DimensionSection({
  id,
  title,
  description,
  score,
  projectSlug,
  affected,
  healthy,
  coverage,
  emptyAffectedMessage = "No material issues affected this score in the current window.",
}: {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly score: number | null
  readonly projectSlug: string
  readonly affected: readonly DimensionEvidenceRow[]
  readonly healthy: readonly DimensionEvidenceRow[]
  readonly coverage: readonly DimensionEvidenceRow[]
  readonly emptyAffectedMessage?: string
}) {
  const [open, setOpen] = useState(true)

  return (
    <section className="@container overflow-hidden rounded-xl bg-secondary">
      <button
        type="button"
        className="flex min-h-24 w-full cursor-pointer flex-row items-center gap-4 px-6 py-4 text-left"
        aria-expanded={open}
        aria-controls={`${id}-details`}
        aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
        onClick={() => setOpen((value) => !value)}
      >
        <DimensionScoreRing score={score} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text.H5M>{title}</Text.H5M>
          <Text.H6 color="foregroundMuted">{description}</Text.H6>
        </div>
        <Icon icon={open ? ChevronDownIcon : ChevronUpIcon} size="sm" color="foregroundMuted" />
      </button>
      {open ? (
        <div id={`${id}-details`} className="flex flex-col gap-4 px-6 pb-4">
          <EvidenceGroup
            id={`${id}-affected`}
            label="Affected by"
            rows={affected}
            projectSlug={projectSlug}
            initiallyOpen
            emptyMessage={emptyAffectedMessage}
          />
          <EvidenceGroup
            id={`${id}-healthy`}
            label="Healthy"
            rows={[...healthy, ...coverage]}
            projectSlug={projectSlug}
            initiallyOpen={score === null}
          />
        </div>
      ) : null}
    </section>
  )
}

export function DimensionSectionSkeleton() {
  return (
    <output
      className="flex min-h-24 w-full flex-row items-center gap-4 rounded-xl bg-secondary px-6 py-4"
      aria-label="Loading score dimension"
      aria-busy="true"
    >
      <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    </output>
  )
}
