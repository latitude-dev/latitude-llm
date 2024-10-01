import { useCallback, useState } from 'react'

import { EvaluationDto, ProviderLogDto } from '@latitude-data/core/browser'
import {
  DocumentLogWithMetadata,
  EvaluationResultWithMetadata,
} from '@latitude-data/core/repositories'
import { Modal, ReactStateDispatch, Text } from '@latitude-data/web-ui'
import useProviderLogs from '$/stores/providerLogs'
import useSWR from 'swr'

import { MetadataInfoTabs } from '../../../../../_components/MetadataInfoTabs'
import { DocumentLogInfo } from '../../../../../logs/_components/DocumentLogs/DocumentLogInfo'
import { EvaluationResultMessages } from './Messages'
import { EvaluationResultMetadata } from './Metadata'

type MaybeDocumentLog = number | null | undefined

function useFetchDocumentLog({ documentLogId }: { documentLogId: number }) {
  const {
    data: documentLog,
    isLoading,
    error,
  } = useSWR<DocumentLogWithMetadata>(
    ['documentLogs', documentLogId],
    useCallback(async () => {
      const response = await fetch(`/api/documentLogs/${documentLogId}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      return response.json()
    }, [documentLogId]),
  )
  return { documentLog, isLoading, error }
}

export default function DocumentLogInfoModal({
  documentLogId,
  onOpenChange,
}: {
  documentLogId: number
  onOpenChange: ReactStateDispatch<MaybeDocumentLog>
}) {
  const { documentLog, isLoading, error } = useFetchDocumentLog({
    documentLogId,
  })
  const { data: providerLogs } = useProviderLogs({
    documentLogUuid: documentLog?.uuid,
  })
  return (
    <Modal
      defaultOpen
      onOpenChange={() => onOpenChange(null)}
      title='Document Log Info'
      description='Detais of original document log'
    >
      <DocumentLogInfo
        documentLog={documentLog!}
        providerLogs={providerLogs}
        isLoading={isLoading}
        error={error}
      />
    </Modal>
  )
}

export function EvaluationResultInfo({
  evaluation,
  evaluationResult,
  providerLog,
}: {
  evaluation: EvaluationDto
  evaluationResult: EvaluationResultWithMetadata
  providerLog?: ProviderLogDto
}) {
  const [selected, setSelected] = useState<MaybeDocumentLog>(null)
  const onClickOpen = useCallback(async () => {
    setSelected(evaluationResult.documentLogId)
  }, [evaluationResult.documentLogId])
  return (
    <>
      <MetadataInfoTabs
        className='w-full'
        beforeTabs={
          <div>
            <Text.H6 color='foregroundMuted'>
              Showing the evaluation metadata. Check the{' '}
            </Text.H6>
            <button onClick={onClickOpen}>
              <Text.H6 color='primary'>original log metadata here</Text.H6>
            </button>
          </div>
        }
      >
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && (
              <EvaluationResultMetadata
                evaluation={evaluation}
                evaluationResult={evaluationResult}
                providerLog={providerLog}
              />
            )}
            {selectedTab === 'messages' && (
              <EvaluationResultMessages providerLog={providerLog} />
            )}
          </>
        )}
      </MetadataInfoTabs>
      {selected ? (
        <DocumentLogInfoModal
          documentLogId={selected}
          onOpenChange={setSelected}
        />
      ) : null}
    </>
  )
}
