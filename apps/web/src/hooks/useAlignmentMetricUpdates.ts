import { useCallback, useState } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { AlignmentMetricMetadata } from '@latitude-data/core/constants'
import { calculateMCC } from '$/helpers/evaluation-generation/calculateMCC'

type UseAlignmentMetricUpdatesParams = {
  evaluationUuid: string
  initialMetadata: AlignmentMetricMetadata | null | undefined
}

type UseAlignmentMetricUpdatesReturn = {
  alignmentMetricMetadata: AlignmentMetricMetadata | undefined
  confusionMatrix: AlignmentMetricMetadata['confusionMatrix'] | undefined
  alignmentMetric: number | undefined
  isRecalculating: boolean
}

export function useAlignmentMetricUpdates({
  evaluationUuid,
  initialMetadata,
}: UseAlignmentMetricUpdatesParams): UseAlignmentMetricUpdatesReturn {
  const [alignmentMetricMetadata, setAlignmentMetricMetadata] = useState<
    AlignmentMetricMetadata | undefined
  >(initialMetadata ?? undefined)

  const onAlignmentMetricUpdated = useCallback(
    (args: EventArgs<'evaluationV2AlignmentMetricUpdated'>) => {
      if (!args || args.evaluationUuid !== evaluationUuid) return
      setAlignmentMetricMetadata(args.alignmentMetricMetadata)
    },
    [evaluationUuid],
  )

  useSockets({
    event: 'evaluationV2AlignmentMetricUpdated',
    onMessage: onAlignmentMetricUpdated,
  })

  const confusionMatrix = alignmentMetricMetadata?.confusionMatrix
  const alignmentMetric = confusionMatrix
    ? calculateMCC({ confusionMatrix })
    : 0
  const isRecalculating = !!alignmentMetricMetadata?.recalculatingAt

  return {
    alignmentMetricMetadata,
    confusionMatrix,
    alignmentMetric,
    isRecalculating,
  }
}
