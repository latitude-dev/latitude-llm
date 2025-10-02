import {
  UseDocumentParameters,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import {
  CollapsibleBox,
  OnToggleFn,
} from '@latitude-data/web-ui/molecules/CollapsibleBox'
import {
  TabSelector,
  TabSelectorOption,
} from '@latitude-data/web-ui/molecules/TabSelector'
import { ICommitContextType } from '@latitude-data/web-ui/providers'

import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'
import { DatasetParams } from '../../Playground/DocumentParams/DatasetParams'
import {
  UseSelectDataset,
  useSelectDataset,
} from '../../Playground/DocumentParams/DatasetParams/useSelectDataset'
import { HistoryLogParams } from '../../Playground/DocumentParams/HistoryLogParams'
import {
  UseLogHistoryParams,
  useLogHistoryParams,
} from '../../Playground/DocumentParams/HistoryLogParams/useLogHistoryParams'
import { ManualParams } from '../../Playground/DocumentParams/ManualParams'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import {
  INPUT_SOURCE,
  InputSource,
} from '@latitude-data/core/lib/documentPersistedInputs'

export const TABS: TabSelectorOption<InputSource>[] = [
  { label: 'Manual', value: INPUT_SOURCE.manual },
  { label: 'Dataset', value: INPUT_SOURCE.dataset },
  { label: 'History', value: INPUT_SOURCE.history },
]

export type Props = {
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

type DocumentParamsProps = Props & {
  maxHeight?: string
  expandedHeight?: number
  source: UseDocumentParameters['source']
  setSource: UseDocumentParameters['setSource']
}
export default function DocumentParams({
  onToggle,
  isExpanded,
  setSource,
  source,
  maxHeight,
  expandedHeight,
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
  })

  const contentProps = {
    ...props,
    source,
    setSource,
    datasetInfo,
    historyInfo,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Preview'
        icon='braces'
        isExpanded={isExpanded}
        maxHeight={maxHeight}
        expandedHeight={expandedHeight}
        onToggle={onToggle}
        expandedContent={<ParamsTabs {...contentProps} />}
        expandedContentHeader={
          <div className='flex flex-row flex-grow items-center justify-start'>
            <OpenInDocsButton route={DocsRoute.Playground} />
          </div>
        }
      />
    </ClientOnly>
  )
}
