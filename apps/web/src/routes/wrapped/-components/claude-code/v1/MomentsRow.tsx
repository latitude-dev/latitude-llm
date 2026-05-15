import type { WrappedReportRecord } from "@domain/spans"

interface MomentsRowProps {
  readonly moments: WrappedReportRecord["report"]["moments"]
  /**
   * When false, the cards strip workspace + filename details before
   * rendering — `Longest session` shows duration only, and
   * `Biggest single write` promotes the line count to be the primary
   * value with no secondary detail. Defence-in-depth: the wire payload
   * already arrives redacted for non-members, but this guarantees the
   * UI matches even if the data shape ever drifts.
   */
  readonly isMember: boolean
}

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "0m"
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

const formatBusiestDay = (date: string): string => {
  const [y, m, d] = date.split("-").map((part) => Number.parseInt(part, 10))
  if (!y || !m || !d) return date
  const utc = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc)
}

function MomentCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl p-5 text-center" style={{ backgroundColor: "#E8E4D8" }}>
      <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}>
        {label}
      </p>
      <p
        className="mt-2 text-xl sm:text-2xl"
        style={{ color: "#1A1A1A", fontFamily: "Georgia, serif", fontWeight: 500 }}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs" style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}>
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export function MomentsRow({ moments, isMember }: MomentsRowProps) {
  const hasAny = moments.longestSession || moments.busiestDay || moments.biggestWrite
  if (!hasAny) return null

  // Workspace name on the longest-session card is only visible to org
  // members — strip it for the public view.
  const longestSessionDetail = isMember ? (moments.longestSession?.workspace ?? undefined) : undefined

  const busiestDayDetail = moments.busiestDay
    ? `${moments.busiestDay.toolCalls.toLocaleString("en-US")} tool calls`
    : undefined

  // For members the filename is the headline value and the line count is
  // the detail. For non-members the filename isn't shipped (server-side
  // redaction empties `displayName`), so promote the line count to be
  // the headline value with no secondary detail.
  const biggestWriteLines = moments.biggestWrite
    ? `${moments.biggestWrite.lines.toLocaleString("en-US")} line${moments.biggestWrite.lines === 1 ? "" : "s"}`
    : "—"
  const biggestWriteValue =
    isMember && moments.biggestWrite?.displayName ? moments.biggestWrite.displayName : biggestWriteLines
  const biggestWriteDetail = isMember && moments.biggestWrite ? biggestWriteLines : undefined

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MomentCard
        label="Longest session"
        value={moments.longestSession ? formatDuration(moments.longestSession.durationMs) : "—"}
        {...(longestSessionDetail ? { detail: longestSessionDetail } : {})}
      />
      <MomentCard
        label="Busiest day"
        value={moments.busiestDay ? formatBusiestDay(moments.busiestDay.date) : "—"}
        {...(busiestDayDetail ? { detail: busiestDayDetail } : {})}
      />
      <MomentCard
        label="Biggest single write"
        value={biggestWriteValue}
        {...(biggestWriteDetail ? { detail: biggestWriteDetail } : {})}
      />
    </section>
  )
}
