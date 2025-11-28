import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TabSelector } from '$/components/TabSelector'
import { TabSelectorOption } from '@latitude-data/web-ui/molecules/TabSelector'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'
import { DatasetParams } from './DatasetParams'
import { HistoryLogParams } from './HistoryLogParams'
import { ManualParams } from './ManualParams'

import {
  INPUT_SOURCE,
  InputSource,
} from '@latitude-data/core/lib/documentPersistedInputs'
import { memo, useState, useCallback, useEffect } from 'react'
import { useMetadataParameters } from '$/hooks/useMetadataParameters'
import { useDocumentParameterValues } from './DocumentParametersContext'

export const TABS: TabSelectorOption<InputSource>[] = [
  { label: 'Manual', value: INPUT_SOURCE.manual },
  { label: 'Dataset', value: INPUT_SOURCE.dataset },
  { label: 'History', value: INPUT_SOURCE.history },
]

export type Props = {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  source?: InputSource
  setSource?: (source: InputSource) => void
}

function ParamsTabs({
  document,
  commit,
  source,
  onSourceChange,
  metadataParameters,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  source: InputSource
  onSourceChange: (source: InputSource) => void
  metadataParameters: string[]
}) {
  return (
    <div className='w-full flex flex-col gap-4'>
      <TabSelector<InputSource>
        fullWidth
        options={TABS}
        selected={source}
        onSelect={onSourceChange}
      />
      {source === INPUT_SOURCE.manual && (
        <ManualParams metadataParameters={metadataParameters} />
      )}
      {source === INPUT_SOURCE.dataset && (
        <DatasetParams
          document={document}
          metadataParameters={metadataParameters}
        />
      )}
      {source === INPUT_SOURCE.history && (
        <HistoryLogParams
          document={document}
          commit={commit}
          metadataParameters={metadataParameters}
        />
      )}
    </div>
  )
}

function DocumentParamsContent(props: Props) {
  const [internalSource, setInternalSource] = useState<InputSource>(
    INPUT_SOURCE.manual,
  )
  const { parameters: metadataParameters } = useMetadataParameters()
  const { setCurrentSource } = useDocumentParameterValues()

  // Use provided source/setSource if available, otherwise use internal state
  const source = props.source ?? internalSource

  // Sync context's current source when source changes
  useEffect(() => {
    setCurrentSource(source)
  }, [source, setCurrentSource])

  const handleSourceChange = useCallback(
    (newSource: InputSource) => {
      props.setSource?.(newSource)
      setInternalSource(newSource)
    },
    [props],
  )

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
        <ParamsTabs
          document={props.document}
          commit={props.commit}
          source={source}
          onSourceChange={handleSourceChange}
          metadataParameters={metadataParameters}
        />
      </div>
    </div>
  )
}

export default memo(function DocumentParams(props: Props) {
  return <DocumentParamsContent {...props} />
})
