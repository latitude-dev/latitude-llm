export const RELATIVE_DATES = {
  today: 'today',
  yesterday: 'yesterday',
  current_week: 'current_week',
  current_month: 'current_month',
  current_year: 'current_year',
  last_week: 'last_week',
  last_month: 'last_month',
  last_3_days: 'last_3_days',
  last_7_days: 'last_7_days',
  last_14_days: 'last_14_days',
  last_30_days: 'last_30_days',
  last_60_days: 'last_60_days',
  last_90_days: 'last_90_days',
  last_12_months: 'last_12_months',
} as const

export type RelativeDate = keyof typeof RELATIVE_DATES
