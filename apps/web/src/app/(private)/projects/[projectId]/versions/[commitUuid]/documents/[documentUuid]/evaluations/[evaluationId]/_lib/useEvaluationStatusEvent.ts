import { useCallback } from 'react'

import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'

export function useEvaluationStatusEvent({
  evaluationId,
  documentUuid,
  onStatusChange,
}: {
  evaluationId: number
  documentUuid: string
  onStatusChange: (args: EventArgs<'evaluationStatus'>) => void
}) {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationStatus'>) => {
      if (evaluationId !== args.evaluationId) return
      if (documentUuid !== args.documentUuid) return

      onStatusChange(args)
    },
    [evaluationId, documentUuid, onStatusChange],
  )
  useSockets({ event: 'evaluationStatus', onMessage })
}
