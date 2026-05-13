import type { WrappedReportRecord } from "@domain/spans"

interface MomentsRowProps {
  readonly moments: WrappedReportRecord["report"]["moments"]
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

export function MomentsRow({ moments }: MomentsRowProps) {
  const hasAny = moments.longestSession || moments.busiestDay || moments.biggestWrite
  if (!hasAny) return null

  const longestSessionDetail = moments.longestSession?.workspace ?? undefined
  const busiestDayDetail = moments.busiestDay
    ? `${moments.busiestDay.toolCalls.toLocaleString("en-US")} tool calls`
    : undefined
  const biggestWriteDetail = moments.biggestWrite
    ? `${moments.biggestWrite.lines.toLocaleString("en-US")} line${moments.biggestWrite.lines === 1 ? "" : "s"}`
    : undefined

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
        value={moments.biggestWrite?.displayName ?? "—"}
        {...(biggestWriteDetail ? { detail: biggestWriteDetail } : {})}
      />
    </section>
  )
}
