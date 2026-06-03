import { Status } from "@repo/ui"
import { relativeTime } from "@repo/utils"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function IncidentStatus({
  startedAtIso,
  endedAtIso,
}: {
  readonly startedAtIso: string
  readonly endedAtIso: string | null
}) {
  if (!endedAtIso) {
    return <Status variant="destructive" label={`Ongoing since ${relativeTime(new Date(startedAtIso))}`} />
  }
  const stale = Date.now() - Date.parse(endedAtIso) > ONE_WEEK_MS
  return <Status variant={stale ? "neutral" : "warning"} label={`Closed ${relativeTime(new Date(endedAtIso))}`} />
}
