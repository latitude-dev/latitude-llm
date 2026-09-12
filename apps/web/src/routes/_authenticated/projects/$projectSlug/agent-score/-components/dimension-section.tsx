import { Icon, Skeleton, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon, HashIcon } from "lucide-react"
import { useState } from "react"
import type { DimensionEvidenceRow, EvidenceTone } from "./dimension-evidence.ts"
import { DimensionScoreRing } from "./score-ring.tsx"

const toneClasses: Record<EvidenceTone, { readonly text: string; readonly bar: string }> = {
  negative: { text: "text-destructive-muted-foreground", bar: "bg-destructive-muted-foreground" },
  positive: { text: "text-success-muted-foreground", bar: "bg-success-muted-foreground" },
  neutral: { text: "text-muted-foreground", bar: "bg-muted-foreground" },
}

function EvidenceRow({ row }: { readonly row: DimensionEvidenceRow }) {
  const colors = toneClasses[row.tone]
  return (
    <div
      className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-2 transition-colors hover:bg-muted/60 @max-[38rem]:grid-cols-1"
      title={row.description}
    >
      <div className="flex min-w-0 flex-row items-center gap-3">
        <span className="text-muted-foreground">
          <Icon icon={row.signal ? ExternalLinkIcon : HashIcon} size="sm" />
        </span>
        <Text.H6 color="foregroundMuted" className="truncate">
          {row.label}
        </Text.H6>
      </div>
      <div className="flex min-w-40 flex-row items-center justify-end gap-3 @max-[38rem]:pl-7">
        <Text.H6M
          color={row.signal ? "foregroundMuted" : "inherit"}
          className={`min-w-16 text-right tabular-nums ${row.signal ? "" : colors.text}`}
        >
          {row.value}
        </Text.H6M>
        {row.signal ? (
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={`h-full rounded-full ${colors.bar}`}
              style={{ width: `${Math.max(4, Math.round(row.progress * 100))}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function EvidenceGroup({
  id,
  label,
  rows,
  initiallyOpen,
  emptyMessage,
}: {
  readonly id: string
  readonly label: string
  readonly rows: readonly DimensionEvidenceRow[]
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
        <div id={id} className="divide-y divide-border border-t border-border">
          {rows.length > 0 ? (
            rows.map((row) => <EvidenceRow key={row.id} row={row} />)
          ) : (
            <div className="px-6 py-4">
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
  affected,
  healthy,
  emptyAffectedMessage = "No contributing causes were identified in the current evidence.",
}: {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly score: number | null
  readonly affected: readonly DimensionEvidenceRow[]
  readonly healthy: readonly DimensionEvidenceRow[]
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
            initiallyOpen
            emptyMessage={emptyAffectedMessage}
          />
          <EvidenceGroup id={`${id}-healthy`} label="Healthy" rows={healthy} initiallyOpen={false} />
        </div>
      ) : null}
    </section>
  )
}

export function DimensionSectionSkeleton() {
  return <Skeleton className="h-24 w-full rounded-xl" />
}
