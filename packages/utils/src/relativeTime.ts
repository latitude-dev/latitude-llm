const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const TEN_MONTHS = 300 * DAY

function formatTime(date: Date, locale: Intl.LocalesArgument) {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date)
}

export function relativeTime(date: Date | string | null | undefined, locale: Intl.LocalesArgument = "en"): string {
  if (!date) return "-"

  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const absDiffMs = Math.abs(diffMs)
  const sign = diffMs >= 0 ? -1 : 1

  if (absDiffMs < MINUTE) return "just now"

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })

  if (absDiffMs < HOUR) {
    return rtf.format(sign * Math.round(absDiffMs / MINUTE), "minute")
  }

  if (absDiffMs < DAY) {
    return rtf.format(sign * Math.round(absDiffMs / HOUR), "hour")
  }

  const time = formatTime(d, locale)

  if (absDiffMs < 2 * DAY) {
    if (diffMs >= 0) {
      return `Yesterday at ${time}`
    } else {
      return `Tomorrow at ${time}`
    }
  }

  if (absDiffMs < TEN_MONTHS) {
    const monthDay = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(d)
    return `${monthDay} at ${time}`
  }

  const full = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" }).format(d)
  return `${full} at ${time}`
}
