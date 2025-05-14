import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import {
  DocumentVersion,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import {
  ICommitContextType,
  useCurrentCommit,
} from '@latitude-data/web-ui/providers'
import { Dispatch, SetStateAction, useCallback, useState } from 'react'

const useEvaluationStatusSocket = <
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  commit,
  document,
  evaluation,
  setBatches,
}: {
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
  setBatches: Dispatch<
    SetStateAction<Record<string, EventArgs<'evaluationStatus'>>>
  >
}) => {
  const onMessage = useCallback(
    (event: EventArgs<'evaluationStatus'>) => {
      if (!event) return
      if (event.version !== 'v2') return
      if (event.commitId !== commit.id) return
      if (event.documentUuid !== document.documentUuid) return
      if (event.evaluationUuid !== evaluation.uuid) return

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
    [commit, document, evaluation, setBatches],
  )

  useSockets({ event: 'evaluationStatus', onMessage })
}

export function EvaluationBatchIndicator<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>() {
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const [batches, setBatches] = useState<
    Record<string, EventArgs<'evaluationStatus'>>
  >({})
  useEvaluationStatusSocket({ commit, document, evaluation, setBatches })

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
