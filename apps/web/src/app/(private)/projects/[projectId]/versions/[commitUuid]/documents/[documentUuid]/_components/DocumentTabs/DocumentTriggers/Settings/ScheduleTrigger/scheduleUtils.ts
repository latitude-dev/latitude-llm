export type ScheduleType = 'simple' | 'custom' | 'specific'
export type SimpleInterval = 'minute' | 'hour' | 'day' | 'week' | 'month'
export type WeekDay =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'

// Internal UI configuration
export interface ScheduleConfig {
  type: ScheduleType
  simple?: {
    interval: SimpleInterval
    value: number
  }
  custom?: {
    expression: string
  }
  specific?: {
    days: WeekDay[]
    time: string // HH:mm format
    interval: number // every X occurrences
  }
  enabled: boolean
}

// Final configuration to be saved
export interface SavedConfig {
  cronExpression: string
}

export const DEFAULT_CONFIG: ScheduleConfig = {
  type: 'simple',
  simple: {
    interval: 'hour',
    value: 1,
  },
  specific: {
    days: ['monday'],
    time: '09:00',
    interval: 1,
  },
  enabled: true,
}

export const WEEKDAYS: { label: string; value: WeekDay }[] = [
  { label: 'Sunday', value: 'sunday' },
  { label: 'Monday', value: 'monday' },
  { label: 'Tuesday', value: 'tuesday' },
  { label: 'Wednesday', value: 'wednesday' },
  { label: 'Thursday', value: 'thursday' },
  { label: 'Friday', value: 'friday' },
  { label: 'Saturday', value: 'saturday' },
]

// Map weekday names to cron day numbers (0-6, where 0 is Sunday)
const WEEKDAY_TO_CRON: Record<WeekDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

// Convert the current UI configuration to a cron expression
export const convertToCronExpression = (config: ScheduleConfig): string => {
  if (config.type === 'custom' && config.custom) {
    // For custom type, use the expression directly
    return config.custom.expression
  } else if (config.type === 'specific' && config.specific) {
    // For specific days and times
    const { days, time, interval } = config.specific
    const [hours, minutes] = time.split(':').map(Number)

    // Handle the interval for specific days
    if (interval > 1) {
      // For intervals > 1, we need to use a more complex approach
      // We will use the day of month with a step value to approximate the interval
      // This is an approximation as cron does not directly support "every X occurrences"
      const daysList = days.map((day) => WEEKDAY_TO_CRON[day]).join(',')

      // Create cron expression that runs on the specified days but with a day-of-month step
      // This will run on the specified weekdays, but only when the day of month matches the step
      return `${minutes} ${hours} */${interval} * ${daysList}`
    } else {
      // For interval = 1 (every occurrence), use the standard format
      const daysList = days.map((day) => WEEKDAY_TO_CRON[day]).join(',')
      return `${minutes} ${hours} * * ${daysList}`
    }
  } else if (config.type === 'simple' && config.simple) {
    // For simple intervals
    const { interval, value } = config.simple

    switch (interval) {
      case 'minute':
        // Every X minutes: */X * * * *
        return value === 1 ? '* * * * *' : `*/${value} * * * *`
      case 'hour':
        // Every X hours: 0 */X * * *
        return value === 1 ? '0 * * * *' : `0 */${value} * * *`
      case 'day':
        // Every X days: 0 0 */X * *
        return value === 1 ? '0 0 * * *' : `0 0 */${value} * *`
      case 'week':
        // Every X weeks (approximated as every X*7 days): 0 0 */X7 * *
        return value === 1 ? '0 0 * * 1' : `0 0 1-31/${value * 7} * *`
      case 'month':
        // Every X months: 0 0 1 */X *
        return value === 1 ? '0 0 1 * *' : `0 0 1 */${value} *`
      default:
        return '* * * * *'
    }
  }

  // Default fallback
  return '* * * * *'
}

// Generate human-readable description of the schedule
export const getScheduleDescription = (config: ScheduleConfig): string => {
  if (config.type === 'simple' && config.simple) {
    const { interval, value } = config.simple
    if (value === 1) {
      return `Every ${interval}`
    } else {
      return `Every ${value} ${interval}s`
    }
  } else if (config.type === 'custom' && config.custom) {
    return `Custom schedule: ${config.custom.expression}`
  } else if (config.type === 'specific' && config.specific) {
    const { days, time, interval } = config.specific
    const dayNames = days.map((day) => day.charAt(0).toUpperCase() + day.slice(1)).join(', ')

    const intervalText = interval > 1 ? `every ${interval} occurrences` : 'every occurrence'

    return `At ${time} on ${dayNames}, ${intervalText}`
  }
  return ''
}
