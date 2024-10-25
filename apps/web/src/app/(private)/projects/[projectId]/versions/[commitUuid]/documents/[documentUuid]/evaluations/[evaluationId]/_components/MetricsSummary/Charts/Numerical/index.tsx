import { EvaluationDto } from '@latitude-data/core/browser'

import { CostOverResultsChart } from './CostOverResults'
import { ResultOverTimeChart } from './ResultsOverTime'

export function NumericalCharts({
  evaluation,
  documentUuid,
}: {
  evaluation: EvaluationDto
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
