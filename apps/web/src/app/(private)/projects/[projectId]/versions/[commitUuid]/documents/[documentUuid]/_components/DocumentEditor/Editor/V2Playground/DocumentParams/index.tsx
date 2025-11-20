import {
  UseDocumentParameters,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TabSelector } from '$/components/TabSelector'
import { TabSelectorOption } from '@latitude-data/web-ui/molecules/TabSelector'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'
import { DatasetParams } from './DatasetParams'
import {
  UseSelectDataset,
  useSelectDataset,
} from './DatasetParams/useSelectDataset'
import { HistoryLogParams } from './HistoryLogParams'
import { ManualParams } from './ManualParams'

import {
  INPUT_SOURCE,
  InputSource,
} from '@latitude-data/core/lib/documentPersistedInputs'
import { memo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSpan } from '$/stores/spans'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'

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
}
type ContentProps = Props & {
  source: InputSource
  setSource: ReturnType<typeof useDocumentParameters>['setSource']
  datasetInfo: UseSelectDataset
}

function ParamsTabs({
  document,
  commit,
  prompt,
  setPrompt,
  setSource,
  source,
  datasetInfo,
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
    </div>
  )
}

type DocumentParamsProps = Props & {
  source: UseDocumentParameters['source']
  setSource: UseDocumentParameters['setSource']
}

export default memo(function DocumentParams({
  setSource,
  source,
  ...props
}: DocumentParamsProps) {
  const commit = props.commit
  const searchParams = useSearchParams()
  const [urlSpanId, setUrlSpanId] = useState<string | undefined>(
    searchParams.get('spanId') as string | undefined,
  )
  const [urlTraceId, setUrlTraceId] = useState<string | undefined>(
    searchParams.get('traceId') as string | undefined,
  )

  // Fetch the URL span for initial render only
  const { data: urlSpan, isLoading } = useSpan({
    spanId: urlSpanId,
    traceId: urlTraceId,
  })

  const datasetInfo = useSelectDataset({
    document: props.document,
    commitVersionUuid: commit.uuid,
    source,
  })

  const contentProps = {
    ...props,
    source,
    setSource,
    datasetInfo,
  }

  return (
    <div className='w-full border rounded-xl relative bg-background'>
      <div className='flex flex-col cursor-pointer sticky top-0 z-10'>
        <div className='flex flex-shrink-0 justify-between items-center py-3.5 gap-x-4 px-4'>
          <div className='flex flex-row items-center gap-x-2'>
            <Text.H5M userSelect={false}>Preview</Text.H5M>
          </div>
          <div className='flex flex-row flex-grow min-w-0 items-center gap-x-2'>
            <div className='flex-grow min-w-0'>
              <div className='flex flex-row flex-grow items-center justify-start'>
                <OpenInDocsButton route={DocsRoute.Playground} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className='px-4 pb-3.5'>
        {source === INPUT_SOURCE.history && !isLoading ? (
          <HistoryLogParams
            key={urlSpan ? 'url-span' : 'normal-navigation'}
            document={props.document}
            commit={commit}
            urlSpan={urlSpan as SpanWithDetails<SpanType.Prompt>}
            onClearUrlSpan={() => {
              const currentUrl = new URL(window.location.href)
              currentUrl.searchParams.delete('spanId')
              currentUrl.searchParams.delete('traceId')
              window.history.replaceState({}, '', currentUrl.toString())
              setUrlSpanId(undefined)
              setUrlTraceId(undefined)
            }}
          />
        ) : (
          <ParamsTabs {...contentProps} />
        )}
      </div>
    </div>
  )
})
