import {
  AppLocalStorage,
  ClientOnly,
  CollapsibleBox,
  ReactStateDispatch,
  TabSelector,
  useLocalStorage,
  type TabSelectorOption,
} from '@latitude-data/web-ui'
import {
  PlaygroundInput,
  PlaygroundInputs,
} from '$/hooks/useDocumentParameters'

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

const PARAMS_SOURCE = {
  manual: 'manual',
  dataset: 'dataset',
  history: 'history',
} as const

export type ParamsSource = (typeof PARAMS_SOURCE)[keyof typeof PARAMS_SOURCE]

const TABS: TabSelectorOption<ParamsSource>[] = [
  { label: 'Manual', value: PARAMS_SOURCE.manual },
  { label: 'Dataset', value: PARAMS_SOURCE.dataset },
  { label: 'History', value: PARAMS_SOURCE.history },
]

type Props = {
  inputs: PlaygroundInputs
  setInput: (param: string, value: PlaygroundInput) => void
  setInputs: (newInputs: PlaygroundInputs) => void
}

type ContentProps = Props & {
  setSelectedTab: ReactStateDispatch<ParamsSource>
  selectedTab: ParamsSource
  datasetInfo: UseSelectDataset
  historyInfo: UseLogHistoryParams
}

function ParamsTabs({
  inputs,
  setInput,
  setSelectedTab,
  selectedTab,
  datasetInfo,
  historyInfo,
}: ContentProps) {
  return (
    <div className='w-full flex flex-col gap-4'>
      <TabSelector<ParamsSource>
        fullWidth
        options={TABS}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />
      {selectedTab === PARAMS_SOURCE.manual && (
        <ManualParams inputs={inputs} setInput={setInput} />
      )}
      {selectedTab === PARAMS_SOURCE.dataset && (
        <DatasetParams
          inputs={inputs}
          setSelectedTab={setSelectedTab}
          data={datasetInfo}
        />
      )}
      {selectedTab === PARAMS_SOURCE.history && (
        <HistoryLogParams
          inputs={inputs}
          setInput={setInput}
          data={historyInfo}
        />
      )}
    </div>
  )
}

function CollapsedContentHeader({
  selectedTab,
  datasetInfo,
  historyInfo,
}: ContentProps) {
  const src = PARAMS_SOURCE

  if (selectedTab === src.manual) return null
  const isDataset =
    selectedTab === PARAMS_SOURCE.dataset && datasetInfo.selectedDataset
  const isHistory = selectedTab === src.history && historyInfo.count > 0

  const onPrevDatasetPage = (page: number) => datasetInfo.onRowChange(page - 1)
  const onNextDatasetPage = (page: number) => datasetInfo.onRowChange(page + 1)

  return (
    <div className='w-full flex flex-col gap-4'>
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

export function DocumentParams(props: Props) {
  const { value: selectedTab, setValue: setSelectedTab } =
    useLocalStorage<ParamsSource>({
      key: AppLocalStorage.playgroundParameterSource,
      defaultValue: PARAMS_SOURCE.manual,
    })
  const { inputs, setInputs } = props
  const datasetInfo = useSelectDataset({ inputs, setInputs })
  const historyInfo = useLogHistoryParams({ inputs, setInputs })
  const contentProps = {
    ...props,
    setSelectedTab,
    selectedTab,
    datasetInfo,
    historyInfo,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Variables'
        initialExpanded
        collapsedContent={null}
        collapsedContentHeader={<CollapsedContentHeader {...contentProps} />}
        expandedContent={<ParamsTabs {...contentProps} />}
      />
    </ClientOnly>
  )
}
