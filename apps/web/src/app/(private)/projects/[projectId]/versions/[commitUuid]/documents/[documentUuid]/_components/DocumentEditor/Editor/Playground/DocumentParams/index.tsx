import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  DocumentVersion,
  INPUT_SOURCE,
  InputSource,
} from '@latitude-data/core/browser'
import {
  ClientOnly,
  CollapsibleBox,
  OnExpandFn,
  TabSelector,
  type ICommitContextType,
  type TabSelectorOption,
} from '@latitude-data/web-ui'

import { DatasetParams } from './DatasetParams'
import {
  UseSelectDataset,
  useSelectDataset,
} from './DatasetParams/useSelectDataset'
import { HistoryLogParams } from './HistoryLogParams'
import {
  UseLogHistoryParams,
  useLogHistoryParams,
} from './HistoryLogParams/useLogHistoryParams'
import { ManualParams } from './ManualParams'
import { ParametersPaginationNav } from './PaginationNav'

const TABS: TabSelectorOption<InputSource>[] = [
  { label: 'Manual', value: INPUT_SOURCE.manual },
  { label: 'Dataset', value: INPUT_SOURCE.dataset },
  { label: 'History', value: INPUT_SOURCE.history },
]

export type Props = {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  prompt: string
  setPrompt: (prompt: string) => void
  onExpand?: OnExpandFn
}
type ContentProps = Props & {
  datasetInfo: UseSelectDataset
  historyInfo: UseLogHistoryParams
}

function ParamsTabs({
  document,
  commit,
  prompt,
  setPrompt,
  datasetInfo,
  historyInfo,
}: ContentProps) {
  const { source, setSource } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  return (
    <div className='w-full flex flex-col gap-4'>
      <TabSelector<InputSource>
        fullWidth
        options={TABS}
        selected={source}
        onSelect={setSource}
      />
      {source === INPUT_SOURCE.manual && (
        <ManualParams
          document={document}
          commit={commit}
          prompt={prompt}
          setPrompt={setPrompt}
        />
      )}
      {source === INPUT_SOURCE.dataset && (
        <DatasetParams data={datasetInfo} document={document} commit={commit} />
      )}
      {source === INPUT_SOURCE.history && (
        <HistoryLogParams
          data={historyInfo}
          document={document}
          commit={commit}
        />
      )}
    </div>
  )
}

function CollapsedContentHeader({
  document,
  commit,
  datasetInfo,
  historyInfo,
}: ContentProps) {
  const src = INPUT_SOURCE
  const { source } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  if (source === src.manual) return null
  const isDataset =
    source === INPUT_SOURCE.dataset && datasetInfo.selectedDataset
  const isHistory = source === src.history && historyInfo.count > 0

  const onPrevDatasetPage = (page: number) => datasetInfo.onRowChange(page - 1)
  const onNextDatasetPage = (page: number) => datasetInfo.onRowChange(page + 1)

  return (
    <div className='w-full flex items-center justify-end gap-4'>
      {isDataset && (
        <ParametersPaginationNav
          zeroIndex
          label='rows in dataset'
          currentIndex={datasetInfo.selectedRowIndex}
          totalCount={datasetInfo.totalRows}
          onPrevPage={onPrevDatasetPage}
          onNextPage={onNextDatasetPage}
        />
      )}
      {isHistory && (
        <ParametersPaginationNav
          label='history logs'
          currentIndex={historyInfo.position}
          totalCount={historyInfo.count}
          onPrevPage={historyInfo.onPrevPage}
          onNextPage={historyInfo.onNextPage}
        />
      )}
    </div>
  )
}

export default function DocumentParams({ onExpand, ...props }: Props) {
  const datasetInfo = useSelectDataset({
    document: props.document,
    commitVersionUuid: props.commit.uuid,
  })

  const historyInfo = useLogHistoryParams({
    document: props.document,
    commitVersionUuid: props.commit.uuid,
  })

  const contentProps = {
    ...props,
    datasetInfo,
    historyInfo,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Parameters'
        icon='braces'
        initialExpanded={true}
        collapsedContentHeader={<CollapsedContentHeader {...contentProps} />}
        expandedContent={<ParamsTabs {...contentProps} />}
        onExpand={onExpand}
      />
    </ClientOnly>
  )
}
