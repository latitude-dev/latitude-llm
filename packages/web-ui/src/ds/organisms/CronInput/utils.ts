import cronstrue from 'cronstrue'

export type CronValue = {
  minutes: string
  hours: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

export enum CronTab {
  Interval = 'interval',
  Schedule = 'schedule',
  Custom = 'custom',
}

export function humanizeCronValue(value: string): string {
  try {
    return cronstrue.toString(value, {
      throwExceptionOnParseError: true,
    })
  } catch {
    return 'Invalid cron expression'
  }
}

export function parseCronValue(cron: string): CronValue {
  const parts = cron.split(' ')
  return {
    minutes: parts[0] ?? '',
    hours: parts[1] ?? '',
    dayOfMonth: parts[2] ?? '',
    month: parts[3] ?? '',
    dayOfWeek: parts[4] ?? '',
  }
}

export function formatCronValue(value: CronValue): string {
  return `${value.minutes} ${value.hours} ${value.dayOfMonth} ${value.month} ${value.dayOfWeek}`
}

// Returns true for interval-style (*/n) cron expressions only.
export function isIntervalCron({
  minutes,
  hours,
  dayOfMonth,
  month,
  dayOfWeek,
}: CronValue): boolean {
  if (month !== '*' || dayOfWeek !== '*') return false
  const valid = (val: string) => /^\*(?:\/\d+)?$/.test(val)
  return (
    (minutes === '0' && hours === '0' && valid(dayOfMonth)) ||
    (minutes === '0' && valid(hours) && dayOfMonth === '*') ||
    (valid(minutes) && hours === '*' && dayOfMonth === '*')
  )
}

// Returns true for “specific time on certain weekdays” style cron expressions only.
export function isScheduleCron({
  minutes,
  hours,
  dayOfMonth,
  month,
  dayOfWeek,
}: CronValue): boolean {
  const isNum = (v: string) => /^\d+$/.test(v)
  const isNumList = (v: string) => /^\d+(?:,\d+)*$/.test(v)
  return (
    isNum(minutes) &&
    isNum(hours) &&
    dayOfMonth === '*' &&
    month === '*' &&
    (dayOfWeek === '*' || isNumList(dayOfWeek))
  )
}

// Calculates the best tab to show based on the cron value
export function getInitialTab(value: CronValue, valueError?: string): CronTab {
  if (valueError) return CronTab.Custom
  if (value.month !== '*') return CronTab.Custom
  if (isIntervalCron(value)) return CronTab.Interval
  if (isScheduleCron(value)) return CronTab.Schedule
  return CronTab.Custom
}
