import { useCallback } from 'react'

import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { EvaluationTmp } from '@latitude-data/core/browser'

export function useEvaluationStatusEvent({
  evaluation,
  documentUuid,
  onStatusChange,
}: {
  evaluation: EvaluationTmp
  documentUuid: string
  onStatusChange: (args: EventArgs<'evaluationStatus'>) => void
}) {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationStatus'>) => {
      if (evaluation.version !== 'v1') return

      if (!args) return
      if (args.version !== 'v1') return
      if (evaluation.id !== args.evaluationId) return
      if (documentUuid !== args.documentUuid) return

      onStatusChange(args)
    },
    [evaluation, documentUuid, onStatusChange],
  )
  useSockets({ event: 'evaluationStatus', onMessage })
}
