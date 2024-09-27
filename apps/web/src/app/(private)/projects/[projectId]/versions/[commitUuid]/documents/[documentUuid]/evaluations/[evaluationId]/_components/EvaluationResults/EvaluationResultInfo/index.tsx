import { useCallback, useRef, useState } from 'react'

import { EvaluationDto, ProviderLogDto } from '@latitude-data/core/browser'
import {
  DocumentLogWithMetadata,
  EvaluationResultWithMetadata,
} from '@latitude-data/core/repositories'
import {
  Button,
  Icon,
  Modal,
  ReactStateDispatch,
  TabSelector,
} from '@latitude-data/web-ui'
import useDynamicHeight from '$/hooks/useDynamicHeight'
import useProviderLogs from '$/stores/providerLogs'
import useSWR from 'swr'

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
  const ref = useRef<HTMLDivElement>(null)
  const [selectedTab, setSelectedTab] = useState<string>('metadata')
  const [selected, setSelected] = useState<MaybeDocumentLog>(null)
  const onClickOpen = useCallback(async () => {
    setSelected(evaluationResult.documentLogId)
  }, [evaluationResult.documentLogId])
  const height = useDynamicHeight({ ref, paddingBottom: 16 })
  return (
    <>
      <div
        ref={ref}
        className='relative w-80 flex-shrink-0 flex flex-col border border-border rounded-lg items-center custom-scrollbar overflow-y-auto'
        style={{
          maxHeight: height ? `${height}px` : 'auto',
        }}
      >
        <div className='z-10 w-full sticky top-0 px-4 bg-white flex justify-center'>
          <div className='pt-6'>
            <TabSelector
              options={[
                { label: 'Metadata', value: 'metadata' },
                { label: 'Messages', value: 'messages' },
              ]}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />
          </div>
        </div>
        <div className='px-4 flex flex-col relative w-full max-w-full'>
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
        </div>
        <div className='w-full py-4 sticky bottom-0 bg-white flex justify-center'>
          <Button variant='link' onClick={onClickOpen}>
            Check original log
            <Icon name='arrowRight' widthClass='w-4' heightClass='h-4' />
          </Button>
        </div>
      </div>
      {selected ? (
        <DocumentLogInfoModal
          documentLogId={selected}
          onOpenChange={setSelected}
        />
      ) : null}
    </>
  )
}
