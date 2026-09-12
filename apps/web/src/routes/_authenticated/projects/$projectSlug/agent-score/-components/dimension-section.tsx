import type { CauseDestination } from "@domain/agent-score"
import { Button, cn, Icon, Skeleton, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
} from "lucide-react"
import { useState } from "react"
import { useSignal } from "../../../../../../domains/signals/signals.collection.ts"
import { FindingRow } from "../../-components/finding-row.tsx"
import type { DimensionEvidenceDetail, DimensionEvidenceRow, EvidenceTone } from "./dimension-evidence.ts"
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

function SignalEvidenceDetails({
  row,
  projectId,
  projectSlug,
}: {
  readonly row: DimensionEvidenceRow & { readonly signalId: string }
  readonly projectId: string
  readonly projectSlug: string
}) {
  const { data: signal, isLoading } = useSignal({ projectId, signalId: row.signalId })
  const title = signal?.name?.trim() || row.label
  const descriptions = [signal?.description?.trim(), row.description].filter(
    (description, index, values): description is string =>
      Boolean(description) && values.indexOf(description) === index,
  )
  const signalSlug = signal?.slug ?? row.signalId

  return (
    <div className="flex min-w-0 items-start gap-4 px-4 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Text.H6B>{title}</Text.H6B>
        {isLoading ? (
          <div className="flex flex-col gap-1 py-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : (
          descriptions.map((description) => (
            <Text.H6 key={description} color="foregroundMuted" className="whitespace-pre-wrap">
              {description}
            </Text.H6>
          ))
        )}
      </div>
      <Button asChild variant="link" size="sm" className="h-auto shrink-0 px-0 py-0">
        <Link
          to="/projects/$projectSlug/signals/$signalSlug"
          params={{ projectSlug, signalSlug }}
          aria-label={`Open signal ${title}`}
        >
          View signal
          <Icon icon={ArrowUpRightIcon} size="xs" />
        </Link>
      </Button>
    </div>
  )
}

/**
 * Where a cause leads, and what to call the link.
 *
 * The benchmark ranks a consequence; the section that owns the evidence is where somebody goes to do
 * something about it. A cause the domain could not place carries no destination and gets no link,
 * because a wrong one wastes more of somebody's time than an absent one.
 */
const DESTINATION_LINKS: Readonly<Record<CauseDestination, { readonly to: string; readonly label: string }>> = {
  sessions: { to: "/projects/$projectSlug", label: "View sessions" },
  tools: { to: "/projects/$projectSlug/tools", label: "View tools" },
  memory: { to: "/projects/$projectSlug/memory", label: "View memory" },
  cost: { to: "/projects/$projectSlug/cost", label: "View cost" },
  signals: { to: "/projects/$projectSlug/signals", label: "View signals" },
}

function DestinationLink({
  destination,
  projectSlug,
}: {
  readonly destination: CauseDestination
  readonly projectSlug: string
}) {
  const link = DESTINATION_LINKS[destination]
  return (
    <div className="flex px-4 py-3">
      <Button asChild variant="link" size="sm" className="h-auto px-0 py-0">
        <Link to={link.to} params={{ projectSlug }}>
          {link.label}
          <Icon icon={ArrowUpRightIcon} size="xs" />
        </Link>
      </Button>
    </div>
  )
}

function EvidenceDetails({ details }: { readonly details: readonly DimensionEvidenceDetail[] }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {details.map((detail) => (
        <div key={detail.label} className="flex min-w-0 items-center justify-between gap-4 px-4 py-2.5">
          <Text.H7 color="foregroundMuted">{detail.label}</Text.H7>
          <Text.H7 className="shrink-0 tabular-nums">{detail.value}</Text.H7>
        </div>
      ))}
    </div>
  )
}

function EvidenceRow({
  row,
  projectId,
  projectSlug,
}: {
  readonly row: DimensionEvidenceRow
  readonly projectId: string
  readonly projectSlug: string
}) {
  const [expanded, setExpanded] = useState(false)
  const expandable =
    row.signalId !== undefined ||
    row.description !== undefined ||
    row.details !== undefined ||
    row.destination !== undefined
  const leading = row.signalId ? (
    <Icon icon={ArrowUpRightIcon} size="xs" color="foregroundMuted" />
  ) : (
    <Icon icon={toneIcon(row.tone)} size="xs" color={toneIconColor(row.tone)} />
  )

  return (
    <div className="flex w-full flex-col">
      <FindingRow
        label={row.label}
        leading={leading}
        trailing={
          <Text.H6 className={cn("shrink-0 tabular-nums", toneClasses[row.tone])} noWrap>
            {row.value}
          </Text.H6>
        }
        expanded={expandable && expanded}
        onToggle={expandable ? () => setExpanded((value) => !value) : undefined}
        className={cn({ "hover:bg-muted/60": expandable, "bg-muted/40": expandable && expanded })}
      />
      {expandable && expanded ? (
        <div className="divide-y divide-border border-t border-border bg-background pl-6">
          {row.signalId ? (
            <SignalEvidenceDetails
              row={{ ...row, signalId: row.signalId }}
              projectId={projectId}
              projectSlug={projectSlug}
            />
          ) : row.description ? (
            <div className="px-4 py-3">
              <Text.H6 color="foregroundMuted">{row.description}</Text.H6>
            </div>
          ) : null}
          {row.details ? <EvidenceDetails details={row.details} /> : null}
          {row.signalId === undefined && row.destination ? (
            <DestinationLink destination={row.destination} projectSlug={projectSlug} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function EvidenceGroup({
  id,
  label,
  rows,
  projectId,
  projectSlug,
  initiallyOpen,
  emptyMessage,
}: {
  readonly id: string
  readonly label: string
  readonly rows: readonly DimensionEvidenceRow[]
  readonly projectId: string
  readonly projectSlug: string
  readonly initiallyOpen: boolean
  readonly emptyMessage?: string
}) {
  const [open, setOpen] = useState(initiallyOpen)
  if (rows.length === 0 && !emptyMessage) return null

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex min-h-12 w-full cursor-pointer flex-row items-center justify-between gap-3 px-6 text-left"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}, ${open ? "hide" : "show"}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Text.H6 color="foregroundMuted">{label}</Text.H6>
        <span className="flex flex-row items-center gap-1 text-muted-foreground">
          <Icon icon={open ? ChevronUpIcon : ChevronDownIcon} size="xs" />
          <Text.H6 color="foregroundMuted">{open ? "Hide" : "Show"}</Text.H6>
        </span>
      </button>
      {open ? (
        <div id={id} className="flex border-t border-border">
          {rows.length > 0 ? (
            <div className="flex w-full flex-col divide-y divide-border">
              {rows.map((row) => (
                <EvidenceRow key={row.id} row={row} projectId={projectId} projectSlug={projectSlug} />
              ))}
            </div>
          ) : (
            <div className="w-full px-4 py-4">
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
  projectId,
  projectSlug,
  affected,
  healthy,
  context,
  coverage,
  emptyAffectedMessage = "No material issues affected this score in the current window.",
}: {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly score: number | null
  readonly projectId: string
  readonly projectSlug: string
  readonly affected: readonly DimensionEvidenceRow[]
  readonly healthy: readonly DimensionEvidenceRow[]
  readonly context: readonly DimensionEvidenceRow[]
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
        <div id={`${id}-details`} className="divide-y divide-border border-t border-border">
          <EvidenceGroup
            id={`${id}-affected`}
            label="Affected by"
            rows={affected}
            projectId={projectId}
            projectSlug={projectSlug}
            initiallyOpen
            emptyMessage={emptyAffectedMessage}
          />
          <EvidenceGroup
            id={`${id}-healthy`}
            label="Healthy"
            rows={healthy}
            projectId={projectId}
            projectSlug={projectSlug}
            initiallyOpen={false}
          />
          <EvidenceGroup
            id={`${id}-context`}
            label="Observed but not scored"
            rows={context}
            projectId={projectId}
            projectSlug={projectSlug}
            initiallyOpen={false}
          />
          <EvidenceGroup
            id={`${id}-coverage`}
            label="Data coverage"
            rows={coverage}
            projectId={projectId}
            projectSlug={projectSlug}
            initiallyOpen={false}
          />
        </div>
      ) : null}
    </section>
  )
}

export function DimensionSectionSkeleton() {
  return <Skeleton className="h-24 w-full rounded-xl" />
}
