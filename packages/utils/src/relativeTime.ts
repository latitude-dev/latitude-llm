const MINUTE = 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24
const WEEK = DAY * 7
const MONTH = DAY * 30
const YEAR = DAY * 365

const DIVISIONS: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
  { amount: MINUTE, name: "seconds" },
  { amount: HOUR, name: "minutes" },
  { amount: DAY, name: "hours" },
  { amount: WEEK, name: "days" },
  { amount: MONTH, name: "weeks" },
  { amount: YEAR, name: "months" },
  { amount: Number.POSITIVE_INFINITY, name: "years" },
]

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "Never"

  const d = typeof date === "string" ? new Date(date) : date
  const seconds = Math.round((d.getTime() - Date.now()) / 1000)

  for (const division of DIVISIONS) {
    if (Math.abs(seconds) < division.amount) {
      const value = Math.round(seconds / (DIVISIONS[DIVISIONS.indexOf(division) - 1]?.amount ?? 1))
      return formatter.format(value, division.name)
    }
  }

  return formatter.format(Math.round(seconds / YEAR), "years")
}
