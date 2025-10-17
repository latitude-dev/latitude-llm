export type DocumentLogsAggregations = {
  totalCount: number
  totalTokens: number
  totalCostInMillicents: number
  averageTokens: number
  averageCostInMillicents: number
  medianCostInMillicents: number
  averageDuration: number
  medianDuration: number
}

export type DocumentLogsLimitedView = DocumentLogsAggregations & {
  dailyCount: { date: string; count: number }[]
}
