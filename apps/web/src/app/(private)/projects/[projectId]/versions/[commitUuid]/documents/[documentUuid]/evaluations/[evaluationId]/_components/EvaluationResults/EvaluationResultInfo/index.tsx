import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import { useProviderLog } from '$/stores/providerLogs'
import {
  EvaluationDto,
  EvaluationMetadataType,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import { type EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import {
  Button,
  cn,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import Link from 'next/link'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'
import { RefObject, useEffect, useRef, useState } from 'react'
import { MetadataInfoTabs } from '../../../../../_components/MetadataInfoTabs'
import { MetadataItem } from '../../../../../_components/MetadataItem'
import { EvaluationResultMessages } from './Messages'
import { EvaluationResultMetadata } from './Metadata'

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

  const { data: evaluatedLog, isLoading } = useProviderLog(
    evaluationResult.evaluatedProviderLogId,
  )

  return (
    <div ref={ref} className='flex flex-col'>
      {isLoading ? (
        <MetadataInfoLoading />
      ) : (
        <MetadataInfo
          evaluation={evaluation}
          evaluationResult={evaluationResult}
          providerLog={providerLog}
          evaluatedLog={evaluatedLog}
        />
      )}
    </div>
  )
}

function MetadataInfoLoading() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Uuid' loading />
      <MetadataItem label='Timestamp' loading />
      <MetadataItem label='Version' loading />
      <MetadataItem label='Result' loading />
    </div>
  )
}

function MetadataInfo({
  evaluation,
  evaluationResult,
  evaluatedLog,
  providerLog,
}: {
  evaluation: EvaluationDto
  evaluationResult: EvaluationResultWithMetadataAndErrors
  evaluatedLog?: ProviderLogDto
  providerLog?: ProviderLogDto
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
            {evaluatedLog && (
              <div className='w-full flex justify-center pt-4'>
                <Link href={evaluatedLogLink({ evaluatedLog })} target='_blank'>
                  <Button
                    variant='link'
                    iconProps={{
                      name: 'arrowRight',
                      widthClass: 'w-4',
                      heightClass: 'h-4',
                      placement: 'right',
                    }}
                  >
                    Check original log
                  </Button>
                </Link>
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
              {evaluatedLog && (
                <div className='w-full flex justify-center pt-4'>
                  <Link
                    href={evaluatedLogLink({ evaluatedLog })}
                    target='_blank'
                  >
                    <Button
                      variant='link'
                      iconProps={{
                        name: 'arrowRight',
                        widthClass: 'w-4',
                        heightClass: 'h-4',
                        placement: 'right',
                      }}
                    >
                      Check original log
                    </Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </MetadataInfoTabs>
      )
  }
}

function evaluatedLogLink({ evaluatedLog }: { evaluatedLog: ProviderLogDto }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const query = new URLSearchParams()
  query.set('logUuid', evaluatedLog.documentLogUuid!)

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).logs.root +
    `?${query.toString()}`
  )
}
