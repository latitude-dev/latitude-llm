import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { cn } from '@latitude-data/web-ui/utils'
import AverageScoreChart from './charts/AverageScore'
import DailyOverviewChart from './charts/DailyOverview'
import AlignmentMetricChart from './charts/AlignmentMetric'
import TotalCostChart from './charts/TotalCost'
import TotalResultsChart from './charts/TotalResults'
import VersionOverviewChart from './charts/VersionOverview'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { EvaluationV2Stats } from '@latitude-data/core/schema/types'

export function EvaluationStats<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ stats, isLoading }: { stats?: EvaluationV2Stats; isLoading?: boolean }) {
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  return (
    <div className='w-full grid xl:grid-cols-3 gap-4'>
      <div className='h-full w-full col-span-2 grid grid-cols-2 gap-4 min-h-56'>
        <DailyOverviewChart stats={stats} isLoading={isLoading} />
        <VersionOverviewChart stats={stats} isLoading={isLoading} />
      </div>
      <div className='h-full w-full col-span-2 xl:col-span-1 grid grid-rows-2 gap-4'>
        <div
          className={cn('grid gap-4', {
            'grid-cols-1': evaluation.type !== EvaluationType.Llm,
            'grid-cols-2': evaluation.type === EvaluationType.Llm,
          })}
        >
          <TotalResultsChart stats={stats} isLoading={isLoading} />
          {evaluation.type === EvaluationType.Llm && (
            <AverageScoreChart stats={stats} isLoading={isLoading} />
          )}
        </div>
        <div
          className={cn('grid gap-4', {
            'grid-cols-1': evaluation.type !== EvaluationType.Llm,
            'grid-cols-2': evaluation.type === EvaluationType.Llm,
          })}
        >
          {evaluation.type === EvaluationType.Llm && (
            <>
              <TotalCostChart stats={stats} isLoading={isLoading} />
              <AlignmentMetricChart isLoading={isLoading} />
            </>
          )}
          {evaluation.type !== EvaluationType.Llm && (
            <AverageScoreChart stats={stats} isLoading={isLoading} />
          )}
        </div>
      </div>
    </div>
  )
}
