import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { EvaluationDto, ProviderLogDto } from '@latitude-data/core/browser'
import {
  DocumentLogWithMetadataAndError,
  type EvaluationResultWithMetadataAndErrors,
} from '@latitude-data/core/repositories'
import { Button, Icon, Modal, ReactStateDispatch } from '@latitude-data/web-ui'
import useFetcher from '$/hooks/useFetcher'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import useProviderLogs from '$/stores/providerLogs'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'
import useSWR from 'swr'

import { MetadataInfoTabs } from '../../../../../_components/MetadataInfoTabs'
import { DocumentLogInfo } from '../../../../../logs/_components/DocumentLogs/DocumentLogInfo'
import { EvaluationResultMessages } from './Messages'
import { EvaluationResultMetadata } from './Metadata'

type MaybeDocumentLog = number | null | undefined

function useFetchDocumentLog({ documentLogId }: { documentLogId: number }) {
  const fetcher = useFetcher(
    ROUTES.api.documentLogs.detail({ id: documentLogId }).root,
  )
  const {
    data: documentLog,
    isLoading,
    error,
  } = useSWR<DocumentLogWithMetadataAndError>(
    ['documentLogs', documentLogId],
    fetcher,
  )
  return { documentLog, isLoading, error }
}

function DocumentLogInfoModal({
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
  tableRef,
  sidebarWrapperRef,
}: {
  evaluation: EvaluationDto
  evaluationResult: EvaluationResultWithMetadataAndErrors
  providerLog?: ProviderLogDto
  tableRef: RefObject<HTMLTableElement>
  sidebarWrapperRef: RefObject<HTMLDivElement>
}) {
  const [selected, setSelected] = useState<MaybeDocumentLog>(null)
  const onClickOpen = useCallback(async () => {
    setSelected(evaluationResult.documentLogId)
  }, [evaluationResult.documentLogId])
  const ref = useRef<HTMLDivElement | null>(null)
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return

    setTarget(ref.current)
  }, [ref.current])
  const scrollableArea = usePanelDomRef({ selfRef: target })
  const beacon = tableRef.current
  useStickyNested({
    scrollableArea,
    beacon,
    target,
    targetContainer: sidebarWrapperRef.current,
    offset: 24,
  })
  return (
    <div ref={ref} className='flex flex-col'>
      <MetadataInfoTabs className='w-full'>
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
            <div className='w-full flex justify-center'>
              <Button variant='link' onClick={onClickOpen}>
                Check original log
                <Icon name='arrowRight' widthClass='w-4' heightClass='h-4' />
              </Button>
            </div>
          </>
        )}
      </MetadataInfoTabs>
      {selected ? (
        <DocumentLogInfoModal
          documentLogId={selected}
          onOpenChange={setSelected}
        />
      ) : null}
    </div>
  )
}
