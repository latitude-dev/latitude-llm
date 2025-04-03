import {
  UseDocumentParameters,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import {
  DatasetVersion,
  DocumentVersion,
  INPUT_SOURCE,
  InputSource,
} from '@latitude-data/core/browser'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import {
  TabSelector,
  TabSelectorOption,
} from '@latitude-data/web-ui/molecules/TabSelector'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import { OnToggleFn } from '@latitude-data/web-ui/molecules/CollapsibleBox'

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

export const TABS: TabSelectorOption<InputSource>[] = [
  { label: 'Manual', value: INPUT_SOURCE.manual },
  { label: 'Dataset', value: INPUT_SOURCE.dataset },
  { label: 'History', value: INPUT_SOURCE.history },
]

export type Props = {
  datasetVersion: DatasetVersion
  document: DocumentVersion
  commit: ICommitContextType['commit']
  prompt: string
  setPrompt: (prompt: string) => void
  onToggle?: OnToggleFn
  isExpanded?: boolean
}
type ContentProps = Props & {
  source: InputSource
  setSource: ReturnType<typeof useDocumentParameters>['setSource']
  datasetInfo: UseSelectDataset
  historyInfo: UseLogHistoryParams
}

function ParamsTabs({
  document,
  commit,
  prompt,
  setPrompt,
  setSource,
  source,
  datasetInfo,
  historyInfo,
  datasetVersion,
}: ContentProps) {
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
          datasetVersion={datasetVersion}
        />
      )}
      {source === INPUT_SOURCE.dataset && (
        <DatasetParams
          data={datasetInfo}
          document={document}
          commit={commit}
          datasetVersion={datasetVersion}
        />
      )}
      {source === INPUT_SOURCE.history && (
        <HistoryLogParams
          data={historyInfo}
          document={document}
          commit={commit}
          datasetVersion={datasetVersion}
        />
      )}
    </div>
  )
}

function CollapsedContentHeader({
  source,
  datasetInfo,
  historyInfo,
}: ContentProps) {
  const src = INPUT_SOURCE
  if (source === src.manual) return null
  const isDataset =
    source === INPUT_SOURCE.dataset && datasetInfo.selectedDataset
  const isHistory = source === src.history && historyInfo.count > 0
  return (
    <div className='w-full flex items-center justify-end gap-4'>
      {isDataset && (
        <ParametersPaginationNav
          zeroIndex
          label='rows in dataset'
          currentIndex={datasetInfo.position}
          totalCount={datasetInfo.count}
          onPrevPage={datasetInfo.onPrevPage}
          onNextPage={datasetInfo.onNextPage}
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

type DocumentParamsProps = Props & {
  source: UseDocumentParameters['source']
  setSource: UseDocumentParameters['setSource']
}
export default function DocumentParams({
  onToggle,
  isExpanded,
  setSource,
  source,
  ...props
}: DocumentParamsProps) {
  const commit = props.commit
  const datasetInfo = useSelectDataset({
    document: props.document,
    commitVersionUuid: commit.uuid,
    source,
  })

  const historyInfo = useLogHistoryParams({
    document: props.document,
    commitVersionUuid: commit.uuid,
    datasetVersion: props.datasetVersion,
  })

  const contentProps = {
    ...props,
    source,
    setSource,
    datasetInfo,
    historyInfo,
    datasetVersion: props.datasetVersion,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Parameters'
        icon='braces'
        isExpanded={isExpanded}
        onToggle={onToggle}
        collapsedContentHeader={<CollapsedContentHeader {...contentProps} />}
        expandedContent={<ParamsTabs {...contentProps} />}
      />
    </ClientOnly>
  )
}
