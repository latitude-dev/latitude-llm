import { Button, Icon, Status } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { CheckIcon } from "lucide-react"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function IncidentStatus({
  startedAtIso,
  endedAtIso,
  onResolve,
}: {
  readonly startedAtIso: string
  readonly endedAtIso: string | null
  /** When set on an ongoing incident, hovering the pill fades in a Resolve button over it. */
  readonly onResolve?: () => void
}) {
  if (!endedAtIso) {
    const pill = (
      <Status
        variant="destructive"
        label={`Ongoing since ${relativeTime(new Date(startedAtIso))}`}
        className="min-w-0"
      />
    )
    if (!onResolve) return pill
    return (
      // `relative z-1` keeps the overlay clickable above InfiniteTable's stretched row link.
      <div className="group/incident relative z-1 inline-flex max-w-full min-w-0 items-center">
        {pill}
        <Button
          asChild
          variant="destructive"
          size="sm"
          className="absolute inset-0 h-full rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover/incident:opacity-100"
        >
          <button
            type="button"
            aria-label="Resolve incident"
            onClick={(event) => {
              event.stopPropagation()
              onResolve()
            }}
          >
            <Icon icon={CheckIcon} size="xs" className="shrink-0 stroke-3" />
            Resolve
          </button>
        </Button>
      </div>
    )
  }
  const stale = Date.now() - Date.parse(endedAtIso) > ONE_WEEK_MS
  return <Status variant={stale ? "neutral" : "warning"} label={`Closed ${relativeTime(new Date(endedAtIso))}`} />
}
