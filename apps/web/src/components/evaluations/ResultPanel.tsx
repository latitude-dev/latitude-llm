import { MetadataInfoTabs } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataInfoTabs'
import { MetadataItem } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataItem'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import { useProviderLog } from '$/stores/providerLogs'
import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
} from '@latitude-data/constants'
import { Commit, ProviderLogDto } from '@latitude-data/core/browser'
import {
  Button,
  ClickToCopy,
  Text,
  TextArea,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { format } from 'date-fns'
import Link from 'next/link'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'
import { useEffect, useRef, useState } from 'react'
import { EVALUATION_SPECIFICATIONS, ResultPanelProps } from './index'
import ResultBadge from './ResultBadge'

function ResultPanelMetadata<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({ evaluation, result, commit, ...rest }: ResultPanelProps<T, M>) {
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
        {...rest}
      />
    </div>
  )
}

function evaluatedLogLink({
  commit,
  evaluatedLog,
}: {
  commit: Commit
  evaluatedLog: ProviderLogDto
}) {
  const { project } = useCurrentProject()
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

function ResultPanelLoading() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Result uuid' loading />
      <MetadataItem label='Timestamp' loading />
      <MetadataItem label='Version' loading />
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
}: ResultPanelProps<T, M>) {
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

  const { data: evaluatedLog, isLoading: isLoadingEvaluatedLog } =
    useProviderLog(result.evaluatedLogId)

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const isLoading = isLoadingEvaluatedLog || !evaluatedLog

  return (
    <div ref={ref} className='flex flex-col'>
      <MetadataInfoTabs
        tabs={[
          { label: 'Metadata', value: 'metadata' },
          ...typeSpecification.resultPanelTabs,
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
                  evaluatedLog={evaluatedLog}
                  panelRef={panelRef}
                  tableRef={tableRef}
                  {...rest}
                />
              )}
              <typeSpecification.ResultPanelContent
                metric={evaluation.metric}
                evaluation={evaluation}
                result={result}
                commit={commit}
                evaluatedLog={evaluatedLog}
                panelRef={panelRef}
                tableRef={tableRef}
                {...rest}
              />
              <div className='w-full flex justify-center pt-4'>
                <Link
                  href={evaluatedLogLink({
                    commit: commit,
                    evaluatedLog: evaluatedLog,
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
