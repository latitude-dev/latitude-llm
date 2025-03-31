import { MetadataInfoTabs } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataInfoTabs'
import { MetadataItem } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataItem'
import { DocumentLogParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/logs/_components/DocumentLogs/DocumentLogInfo/Metadata'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import useDocumentLog from '$/stores/documentLogWithMetadata'
import { useProviderLog } from '$/stores/providerLogs'
import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
} from '@latitude-data/constants'
import {
  Commit,
  DocumentLog,
  ProviderLogDto,
  buildConversation,
} from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { MessageList } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { format } from 'date-fns'
import Link from 'next/link'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EVALUATION_SPECIFICATIONS, ResultPanelProps } from './index'
import ResultBadge from './ResultBadge'

function ResultPanelMetadata<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  result,
  commit,
  evaluatedDocumentLog,
  ...rest
}: ResultPanelProps<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Result uuid'>
        <ClickToCopy copyValue={result.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {result.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      <MetadataItem
        label='Timestamp'
        value={format(new Date(result.createdAt), 'PPp')}
      />
      <MetadataItem label='Version'>
        <ClickToCopy copyValue={commit.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {commit.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      {result.error ? (
        <MetadataItem
          label='Error'
          value={result.error.message}
          color='destructiveMutedForeground'
          stacked
        />
      ) : (
        <>
          {Object.keys(evaluatedDocumentLog.parameters).length > 0 && (
            <DocumentLogParameters documentLog={evaluatedDocumentLog} />
          )}
          <MetadataItem
            label='Actual output'
            tooltip='Last response from the model conversation'
            stacked
          >
            <div className='pt-2'>
              <TextArea
                value={result.metadata!.actualOutput}
                minRows={1}
                maxRows={6}
                disabled={true}
              />
            </div>
          </MetadataItem>
          {result.metadata!.expectedOutput && (
            <MetadataItem
              label='Expected output'
              tooltip='Batch data from the dataset column'
              stacked
            >
              <div className='pt-2'>
                <TextArea
                  value={result.metadata!.expectedOutput}
                  minRows={1}
                  maxRows={6}
                  disabled={true}
                />
              </div>
            </MetadataItem>
          )}
          <MetadataItem label='Result'>
            <ResultBadge evaluation={evaluation} result={result} />
          </MetadataItem>
          {(evaluation.type === EvaluationType.Llm ||
            evaluation.type === EvaluationType.Human) && (
            <MetadataItem
              label='Reasoning'
              value={
                (
                  result as EvaluationResultV2<
                    EvaluationType.Llm | EvaluationType.Human
                  >
                ).metadata!.reason || 'No reason reported'
              }
              stacked
            />
          )}
        </>
      )}
      <typeSpecification.ResultPanelMetadata
        metric={evaluation.metric}
        evaluation={evaluation}
        result={result}
        commit={commit}
        evaluatedDocumentLog={evaluatedDocumentLog}
        {...rest}
      />
    </div>
  )
}

function ResultPanelMessages({
  providerLog,
  documentLog,
}: {
  providerLog: ProviderLogDto
  documentLog: DocumentLog
}) {
  const conversation = useMemo(
    () => buildConversation(providerLog),
    [providerLog],
  )

  const sourceMapAvailable = useMemo(
    () =>
      conversation.some((message) => {
        if (typeof message.content !== 'object') return false
        return message.content.some((content) => '_promptlSourceMap' in content)
      }),
    [conversation],
  )

  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  if (!conversation.length) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no messages generated for this evaluated log
      </Text.H5>
    )
  }

  return (
    <>
      <div className='flex flex-row items-center justify-between w-full sticky top-0 bg-background pb-2'>
        <Text.H6M>Messages</Text.H6M>
        {sourceMapAvailable && (
          <div className='flex flex-row gap-2 items-center'>
            <Text.H6M>Expand parameters</Text.H6M>
            <SwitchToggle
              checked={expandParameters}
              onCheckedChange={setExpandParameters}
            />
          </div>
        )}
      </div>
      <MessageList
        messages={conversation}
        parameters={Object.keys(documentLog.parameters)}
        collapseParameters={!expandParameters}
      />
    </>
  )
}

function evaluatedDocumentLogLink({
  commit,
  documentLog,
}: {
  commit: Commit
  documentLog: DocumentLog
}) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const query = new URLSearchParams()
  query.set('logUuid', documentLog.uuid)

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).logs.root +
    `?${query.toString()}`
  )
}

function ResultPanelLoading() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Result uuid' loading />
      <MetadataItem label='Timestamp' loading />
      <MetadataItem label='Version' loading />
      <MetadataItem label='Parameters' loading />
      <MetadataItem label='Actual output' loading />
      <MetadataItem label='Expected output' loading />
      <MetadataItem label='Result' loading />
    </div>
  )
}

export function ResultPanel<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  result,
  commit,
  panelRef,
  tableRef,
  ...rest
}: Omit<
  ResultPanelProps<T, M>,
  'evaluatedProviderLog' | 'evaluatedDocumentLog' | 'selectedTab'
>) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [targetRef, setTargetRef] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    setTargetRef(ref.current)
  }, [ref.current])

  const scrollableArea = usePanelDomRef({ selfRef: targetRef })
  useStickyNested({
    scrollableArea: scrollableArea,
    beacon: tableRef.current,
    target: targetRef,
    targetContainer: panelRef.current,
    offset: { top: 12, bottom: 12 },
  })

  const {
    data: evaluatedProviderLog,
    isLoading: isLoadingEvaluatedProviderLog,
  } = useProviderLog(result.evaluatedLogId)

  const {
    data: evaluatedDocumentLog,
    isLoading: isLoadingEvaluatedDocumentLog,
  } = useDocumentLog({ documentLogUuid: evaluatedProviderLog?.documentLogUuid })

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const isLoading =
    isLoadingEvaluatedProviderLog ||
    isLoadingEvaluatedDocumentLog ||
    !evaluatedProviderLog ||
    !evaluatedDocumentLog

  return (
    <div ref={ref} className='flex flex-col'>
      <MetadataInfoTabs
        tabs={[
          { label: 'Metadata', value: 'metadata' },
          { label: 'Messages', value: 'messages' },
          ...typeSpecification.resultPanelTabs({ metric: evaluation.metric }),
        ]}
        className='w-full'
      >
        {({ selectedTab }) =>
          isLoading ? (
            <ResultPanelLoading />
          ) : (
            <>
              {selectedTab === 'metadata' && (
                <ResultPanelMetadata
                  evaluation={evaluation}
                  result={result}
                  commit={commit}
                  evaluatedProviderLog={evaluatedProviderLog}
                  evaluatedDocumentLog={evaluatedDocumentLog}
                  panelRef={panelRef}
                  tableRef={tableRef}
                  selectedTab={selectedTab}
                  {...rest}
                />
              )}
              {selectedTab === 'messages' && (
                <ResultPanelMessages
                  providerLog={evaluatedProviderLog}
                  documentLog={evaluatedDocumentLog}
                />
              )}
              <typeSpecification.ResultPanelContent
                metric={evaluation.metric}
                evaluation={evaluation}
                result={result}
                commit={commit}
                evaluatedProviderLog={evaluatedProviderLog}
                evaluatedDocumentLog={evaluatedDocumentLog}
                panelRef={panelRef}
                tableRef={tableRef}
                selectedTab={selectedTab}
                {...rest}
              />
              <div className='w-full flex justify-center pt-4'>
                <Link
                  href={evaluatedDocumentLogLink({
                    commit: commit,
                    documentLog: evaluatedDocumentLog,
                  })}
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
            </>
          )
        }
      </MetadataInfoTabs>
    </div>
  )
}
