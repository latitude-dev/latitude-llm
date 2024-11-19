import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

import {
  EvaluationDto,
  EvaluationMetadataType,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import {
  DocumentLogWithMetadataAndError,
  type EvaluationResultWithMetadataAndErrors,
} from '@latitude-data/core/repositories'
import {
  Button,
  cn,
  Icon,
  Modal,
  ReactStateDispatch,
} from '@latitude-data/web-ui'
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

type MaybeProviderLog = number | null | undefined

function useFetchDocumentLog({
  documentLogId: providerLogId,
}: {
  documentLogId: number
}) {
  const fetcher = useFetcher(
    ROUTES.api.documentLogs.detail({ id: providerLogId }).root,
  )
  const {
    data: documentLog,
    isLoading,
    error,
  } = useSWR<DocumentLogWithMetadataAndError>(
    ['documentLogs', providerLogId],
    fetcher,
  )
  return { documentLog, isLoading, error }
}

function DocumentLogInfoModal({
  documentLogId,
  providerLogId,
  onOpenChange,
}: {
  documentLogId: number
  providerLogId: number
  onOpenChange: ReactStateDispatch<MaybeProviderLog>
}) {
  const {
    documentLog,
    isLoading: isLoadingDocumentLog,
    error: errorDocumentLog,
  } = useFetchDocumentLog({
    documentLogId,
  })
  const { data: _providerLogs } = useProviderLogs({
    documentLogUuid: documentLog?.uuid,
  })

  const idx = _providerLogs?.findIndex((p) => p.id === providerLogId)
  const providerLogs = _providerLogs?.slice(0, idx + 1)

  return (
    <Modal
      dismissible
      defaultOpen
      onOpenChange={() => onOpenChange(null)}
      title='Document Log Info'
      description='Detais of original document log'
    >
      <DocumentLogInfo
        documentLog={documentLog!}
        providerLogs={providerLogs}
        isLoading={isLoadingDocumentLog}
        error={errorDocumentLog}
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
  const [selected, setSelected] = useState<MaybeProviderLog>(null)
  const onClickOpen = useCallback(async () => {
    setSelected(evaluationResult.evaluatedProviderLogId)
  }, [evaluationResult.evaluatedProviderLogId])
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
    offset: { top: 12, bottom: 12 },
  })
  return (
    <div ref={ref} className='flex flex-col'>
      <MetadataInfo
        evaluation={evaluation}
        evaluationResult={evaluationResult}
        providerLog={providerLog}
        onClickOpen={onClickOpen}
      />
      {!!selected && (
        <DocumentLogInfoModal
          providerLogId={selected}
          documentLogId={evaluationResult.documentLogId}
          onOpenChange={setSelected}
        />
      )}
    </div>
  )
}

function MetadataInfo({
  evaluation,
  evaluationResult,
  providerLog,
  onClickOpen,
}: {
  evaluation: EvaluationDto
  evaluationResult: EvaluationResultWithMetadataAndErrors
  providerLog?: ProviderLogDto
  onClickOpen: () => void
}) {
  switch (evaluation.metadataType) {
    case EvaluationMetadataType.Manual:
      return (
        <div
          className={cn(
            'flex flex-col flex-grow min-h-0 bg-background',
            'border border-border rounded-lg items-center relative w-full',
          )}
        >
          <div className='flex px-4 py-5 flex-col gap-4 w-full overflow-x-auto'>
            <EvaluationResultMetadata
              evaluation={evaluation}
              evaluationResult={evaluationResult}
              providerLog={providerLog}
            />
            {evaluationResult.evaluatedProviderLogId && (
              <div className='w-full flex justify-center'>
                <Button variant='link' onClick={onClickOpen}>
                  Check original log
                  <Icon name='arrowRight' widthClass='w-4' heightClass='h-4' />
                </Button>
              </div>
            )}
          </div>
        </div>
      )
    default:
      return (
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
              {evaluationResult.evaluatedProviderLogId && (
                <div className='w-full flex justify-center'>
                  <Button variant='link' onClick={onClickOpen}>
                    Check original log
                    <Icon
                      name='arrowRight'
                      widthClass='w-4'
                      heightClass='h-4'
                    />
                  </Button>
                </div>
              )}
            </>
          )}
        </MetadataInfoTabs>
      )
  }
}
