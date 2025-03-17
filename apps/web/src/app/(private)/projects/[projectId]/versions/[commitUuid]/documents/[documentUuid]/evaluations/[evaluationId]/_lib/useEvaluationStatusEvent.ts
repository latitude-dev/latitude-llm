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
      if (!args) return

      if (evaluation.version === 'v1' && args.version === 'v1') {
        if (evaluation.id !== args.evaluationId) return
        if (documentUuid !== args.documentUuid) return
      } else if (evaluation.version === 'v2' && args.version === 'v2') {
        if (evaluation.commitId !== args.commitId) return
        if (evaluation.documentUuid !== args.documentUuid) return
        if (evaluation.uuid !== args.evaluationUuid) return
      } else {
        return
      }

      onStatusChange(args)
    },
    [evaluation, documentUuid, onStatusChange],
  )
  useSockets({ event: 'evaluationStatus', onMessage })
}
