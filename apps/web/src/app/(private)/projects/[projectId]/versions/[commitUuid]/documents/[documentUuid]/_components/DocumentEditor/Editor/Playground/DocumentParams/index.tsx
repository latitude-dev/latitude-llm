import { useEffect, useState } from 'react'

import {
  AppLocalStorage,
  CollapsibleBox,
  TabSelector,
  useLocalStorage,
  type TabSelectorOption,
} from '@latitude-data/web-ui'
import {
  PlaygroundInput,
  PlaygroundInputs,
} from '$/hooks/useDocumentParameters'

import { DatasetParams } from './DatasetParams'
import { useSelectDataset } from './DatasetParams/useSelectDataset'
import { HistoryLogParams } from './HistoryLogParams'
import { ManualParams } from './ManualParams'

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

function ParamsTabs({ inputs, setInput, setInputs }: Props) {
  const { value: selectedTab, setValue: setSelectedTab } =
    useLocalStorage<ParamsSource>({
      key: AppLocalStorage.playgroundParameterSource,
      defaultValue: PARAMS_SOURCE.manual,
    })
  const datasetInfo = useSelectDataset({ inputs, setInputs })
  return (
    <div className='w-full flex flex-col gap-4'>
      <TabSelector<ParamsSource>
        width='full'
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
          datasetInfo={datasetInfo}
          setSelectedTab={setSelectedTab}
        />
      )}
      {selectedTab === PARAMS_SOURCE.history && (
        <HistoryLogParams
          inputs={inputs}
          setInput={setInput}
          setInputs={setInputs}
        />
      )}
    </div>
  )
}

export function DocumentParams(props: Props) {
  const [ssr, setSsr] = useState(true)
  useEffect(() => {
    setSsr(false)
  }, [])

  if (ssr) return null

  return (
    <CollapsibleBox
      title='Variables'
      initialExpanded
      collapsedContent={null}
      expandedContent={<ParamsTabs {...props} />}
    />
  )
}
