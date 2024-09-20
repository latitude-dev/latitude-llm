import { Evaluation } from '@latitude-data/core/browser'

import { CostOverResultsChart } from './CostOverResults'
import { ResultOverTimeChart } from './ResultsOverTime'

export function NumericalCharts({
  evaluation,
  documentUuid,
}: {
  evaluation: Evaluation
  documentUuid: string
}) {
  return (
    <>
      <ResultOverTimeChart
        evaluation={evaluation}
        documentUuid={documentUuid}
      />
      <CostOverResultsChart
        evaluation={evaluation}
        documentUuid={documentUuid}
      />
    </>
  )
}
