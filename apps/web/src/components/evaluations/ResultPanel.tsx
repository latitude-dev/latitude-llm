'use client'

import { DATASET_TABLE_PAGE_SIZE } from '$/app/(private)/datasets/_components/DatasetsTable'
import { SpanParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/logs/_components/DocumentLogs/DocumentLogInfo/Metadata'
import { MetadataInfoTabs } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/MetadataInfoTabs'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  useCurrentProject,
  type IProjectContextType,
} from '$/app/providers/ProjectProvider'
import { MetadataItem } from '$/components/MetadataItem'
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import useDatasetRows from '$/stores/datasetRows'
import useDatasetRowCount from '$/stores/datasetRows/count'
import useDatasetRowPosition from '$/stores/datasetRows/position'
import {
  ACCESSIBLE_OUTPUT_FORMATS,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  PromptSpanMetadata,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { DatasetRow } from '@latitude-data/core/schema/models/types/DatasetRow'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { format } from 'date-fns'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EVALUATION_SPECIFICATIONS, ResultPanelProps } from './index'
import ResultBadge from './ResultBadge'
import { useSpan } from '$/stores/spans'

const DataGrid = dynamic(
  () =>
    import('$/app/(private)/datasets/[datasetId]/DatasetDetailTable/DataGrid'),
  {
    ssr: false,
    loading: () => <TableSkeleton rows={8} cols={5} maxHeight={320} />,
  },
)

function EvaluatedDatasetRowModal({
  dataset,
  datasetRow,
  open,
  onOpenChange,
}: {
  dataset: Dataset
  datasetRow: DatasetRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const pageSize = Number(DATASET_TABLE_PAGE_SIZE)

  const {
    data: { page },
    isLoading: isLoadingPosition,
  } = useDatasetRowPosition({ dataset, datasetRow, pageSize })

  const { data: count, isLoading: isLoadingCount } = useDatasetRowCount({
    dataset,
  })

  const {
    data: rows,
    isLoading: isLoadingRows,
    updateRows,
    deleteRows,
    isDeleting,
  } = useDatasetRows({ dataset, page, pageSize })

  const pagination = useMemo(
    () =>
      buildPagination({
        baseUrl: ROUTES.datasets.detail(dataset.id),
        count: count,
        page: page,
        pageSize: pageSize,
      }),
    [dataset, count, page, pageSize],
  )

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === datasetRow.id),
    [rows, datasetRow],
  )

  const datasetCellRoleStyles = useDatasetRole()

  const isLoading = isLoadingRows || isLoadingPosition || isLoadingCount

  return (
    <Modal
      title={`Editing ${dataset.name}`}
      description='Edit the dataset for future evaluations. Existing evaluation results will not change.'
      open={open}
      onOpenChange={onOpenChange}
      size='full'
      dismissible
    >
      {isLoading ? (
        <TableSkeleton rows={8} cols={5} maxHeight={320} />
      ) : (
        <DataGrid
          dataset={dataset}
          rows={rows}
          selectedRow={selectedRow}
          pagination={pagination}
          datasetCellRoleStyles={datasetCellRoleStyles}
          updateRows={updateRows}
          deleteRows={deleteRows}
          isDeleting={isDeleting}
        />
      )}
    </Modal>
  )
}

export function ResultPanelMetadata<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  result,
  commit,
  dataset,
  evaluatedDatasetRow,
  evaluatedTraceId,
  evaluatedSpanId,
  ...rest
}: ResultPanelProps<T, M>) {
  const [openDatasetModal, setOpenDatasetModal] = useState(false)
  const { data: span } = useSpan({
    traceId: evaluatedTraceId,
    spanId: evaluatedSpanId,
  })

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) return null

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
        <Alert
          variant='destructive'
          showIcon={false}
          title='Evaluation failed'
          description={result.error.message}
        />
      ) : (
        <>
          {result.metadata!.actualOutput && (
            <MetadataItem
              label='Actual output'
              tooltip='Generated output from the model conversation'
              stacked
              collapsible
            >
              <div className='flex flex-col gap-2'>
                {ACCESSIBLE_OUTPUT_FORMATS.includes(
                  result.metadata!.configuration.actualOutput?.parsingFormat ||
                    'string',
                ) ? (
                  <Text.H6 color='foregroundMuted' noWrap ellipsis>
                    Parsed from{' '}
                    {result
                      .metadata!.configuration.actualOutput.parsingFormat.toUpperCase()
                      .split('_')
                      .join(' ')}
                    {!!result.metadata!.configuration.actualOutput
                      .fieldAccessor &&
                      ` using field '${result.metadata!.configuration.actualOutput.fieldAccessor}'`}
                  </Text.H6>
                ) : (
                  <div />
                )}
                <TextArea
                  value={result.metadata!.actualOutput}
                  minRows={1}
                  maxRows={6}
                  disabled={true}
                />
              </div>
            </MetadataItem>
          )}
          {result.metadata!.expectedOutput && (
            <MetadataItem
              label='Expected output'
              tooltip='Labeled output from the dataset column'
              action={
                dataset && !dataset.deletedAt && evaluatedDatasetRow ? (
                  <Button
                    variant='link'
                    size='none'
                    iconProps={{
                      name: 'arrowRight',
                      widthClass: 'w-4',
                      heightClass: 'h-4',
                      placement: 'right',
                    }}
                    onClick={() => setOpenDatasetModal(true)}
                  >
                    Edit
                  </Button>
                ) : undefined
              }
              stacked
              collapsible
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
          <MetadataItem
            label='Reasoning'
            value={
              metricSpecification.resultReason(
                result as EvaluationResultSuccessValue<T, M>,
              ) || 'No reason reported'
            }
            stacked
            collapsible
          />
        </>
      )}
      {!!typeSpecification.ResultPanelMetadata && span && (
        <typeSpecification.ResultPanelMetadata
          metric={evaluation.metric}
          evaluation={evaluation}
          result={result}
          commit={commit}
          evaluatedSpanId={span.id}
          evaluatedTraceId={span.traceId}
          {...rest}
        />
      )}
      {Object.keys((span?.metadata as PromptSpanMetadata)?.parameters ?? {})
        .length > 0 && (
        <SpanParameters span={span as SpanWithDetails<SpanType.Prompt>} />
      )}
      {!!dataset && !!evaluatedDatasetRow && (
        <EvaluatedDatasetRowModal
          dataset={dataset}
          datasetRow={evaluatedDatasetRow}
          open={openDatasetModal}
          onOpenChange={setOpenDatasetModal}
        />
      )}
    </div>
  )
}

function EvaluatedTraceLink({
  project,
  commit,
  document,
  traceId,
  spanId,
}: {
  project: IProjectContextType['project']
  commit: Commit
  document: DocumentVersion
  traceId: string
  spanId: string
}) {
  const query = new URLSearchParams({
    filters: JSON.stringify({ traceId, spanId }),
  })

  return `${
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).traces.root
  }?${query.toString()}`
}

export function ResultPanelLoading() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Result uuid' loading />
      <MetadataItem label='Timestamp' loading />
      <MetadataItem label='Version' loading />
      <MetadataItem label='Actual output' loading />
      <MetadataItem label='Expected output' loading />
      <MetadataItem label='Result' loading />
      <MetadataItem label='Reasoning' loading />
      <MetadataItem label='Parameters' loading />
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
  evaluatedSpanId,
  evaluatedTraceId,
  panelRef,
  tableRef,
  ...rest
}: Omit<ResultPanelProps<T, M>, 'evaluatedDocumentLog' | 'selectedTab'>) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [targetRef, setTargetRef] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    setTargetRef(ref.current)
  }, [])

  const scrollableArea = usePanelDomRef({ selfRef: targetRef })
  useStickyNested({
    scrollableArea: scrollableArea,
    beacon: tableRef.current,
    target: targetRef,
    targetContainer: panelRef.current,
    offset: { top: 12, bottom: 12 },
  })

  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  return (
    <div ref={ref} className='flex flex-col'>
      <MetadataInfoTabs
        tabs={[
          { label: 'Metadata', value: 'metadata' },
          ...(typeSpecification.resultPanelTabs?.({
            metric: evaluation.metric,
          }) ?? []),
        ]}
        className='w-full'
      >
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && (
              <ResultPanelMetadata
                evaluation={evaluation}
                result={result}
                commit={commit}
                evaluatedTraceId={evaluatedTraceId}
                evaluatedSpanId={evaluatedSpanId}
                panelRef={panelRef}
                tableRef={tableRef}
                selectedTab={selectedTab}
                {...rest}
              />
            )}
            {!!typeSpecification.ResultPanelContent && (
              <typeSpecification.ResultPanelContent
                metric={evaluation.metric}
                evaluation={evaluation}
                result={result}
                commit={commit}
                evaluatedTraceId={evaluatedTraceId}
                evaluatedSpanId={evaluatedSpanId}
                panelRef={panelRef}
                tableRef={tableRef}
                selectedTab={selectedTab}
                {...rest}
              />
            )}
            <div className='w-full flex justify-center pt-4'>
              <Link
                href={EvaluatedTraceLink({
                  project: project,
                  commit: commit,
                  document: document,
                  traceId: result.evaluatedTraceId!,
                  spanId: result.evaluatedSpanId!,
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
                  Check evaluated log
                </Button>
              </Link>
            </div>
          </>
        )}
      </MetadataInfoTabs>
    </div>
  )
}
