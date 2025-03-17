import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { type EventArgs } from '$/components/Providers/WebsocketsProvider/useSockets'
import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { Badge, ClickToCopy, Text } from '@latitude-data/web-ui'
import { useState } from 'react'
import { useEvaluationStatusEvent } from '../../../evaluations/[evaluationId]/_lib/useEvaluationStatusEvent'

export function EvaluationBatchIndicator<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>() {
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const [batches, setBatches] = useState<
    Record<string, EventArgs<'evaluationStatus'>>
  >({})
  useEvaluationStatusEvent({
    evaluation: { ...evaluation, version: 'v2' },
    documentUuid: document.documentUuid,
    onStatusChange: (event) => {
      setBatches((prev) => {
        if (event.total === event.completed + event.errors) {
          setTimeout(
            () =>
              setBatches((curr) =>
                Object.fromEntries(
                  Object.entries(curr).filter(
                    ([batchId]) => batchId !== event.batchId,
                  ),
                ),
              ),
            5000,
          )
        }
        return { ...prev, [event.batchId]: event }
      })
    },
  })

  return Object.values(batches).map((batch) => (
    <div
      key={batch.batchId}
      className='flex flex-row items-center justify-between gap-4 p-4 rounded-lg border border-border'
    >
      <div className='flex flex-row items-center justify-center gap-x-4'>
        {batch.total === batch.completed + batch.errors ? (
          <Badge variant='muted'>Finished</Badge>
        ) : (
          <Badge variant='accent'>Running</Badge>
        )}
        <div className='flex flex-row items-center justify-center gap-x-2'>
          <Text.H5>{`Evaluated ${batch.completed + batch.errors} of ${batch.total} logs`}</Text.H5>
          {batch.errors > 0 && (
            <>
              <Text.H5 color='foregroundMuted'>·</Text.H5>
              <Text.H5 color='destructiveMutedForeground'>
                {batch.errors} errors
              </Text.H5>
            </>
          )}
        </div>
      </div>
      <div>
        <ClickToCopy copyValue={batch.batchId}>
          <Text.H5 align='right' color='foregroundMuted'>
            Batch {batch.batchId.split(':').at(-1)}
          </Text.H5>
        </ClickToCopy>
      </div>
    </div>
  ))
}
