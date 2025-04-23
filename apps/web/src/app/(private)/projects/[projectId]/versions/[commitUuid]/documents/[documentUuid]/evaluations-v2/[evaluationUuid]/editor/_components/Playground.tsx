import { useEffect, useState } from 'react'

import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { DocumentVersion } from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { COLLAPSED_BOX_HEIGHT } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import type { ConversationMetadata } from 'promptl-ai'

import Chat from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/Chat'
import DocumentParams from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/DocumentParams'
import DocumentParamsLoading from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/DocumentParams/DocumentParamsLoading'
import Preview from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/Preview'

const COLLAPSED_SIZE = COLLAPSED_BOX_HEIGHT + 2
const GAP_PADDING = 24

export function Playground({
  document,
  prompt,
  setPrompt,
  metadata,
}: {
  document: DocumentVersion
  prompt: string
  setPrompt: (prompt: string) => void
  metadata: ConversationMetadata
}) {
  const { commit } = useCurrentCommit()

  const [parametersExpanded, setParametersExpanded] = useState(true)
  const [forcedSize, setForcedSize] = useState<number>()
  useEffect(
    () => setForcedSize(parametersExpanded ? undefined : COLLAPSED_SIZE),
    [parametersExpanded],
  )

  const { parameters, source, setSource } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
  })

  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  const [mode, setMode] = useState<'preview' | 'chat'>('preview')

  return (
    <SplitPane
      direction='vertical'
      gap={4}
      initialPercentage={50}
      forcedSize={forcedSize}
      minSize={COLLAPSED_SIZE + GAP_PADDING}
      dragDisabled={!parametersExpanded}
      firstPane={
        !parameters ? (
          <DocumentParamsLoading source={source} />
        ) : (
          <DocumentParams
            commit={commit}
            document={document}
            prompt={prompt}
            source={source}
            setSource={setSource}
            setPrompt={setPrompt}
            onToggle={setParametersExpanded}
            isExpanded={parametersExpanded}
          />
        )
      }
      secondPane={
        <div className='h-full flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden pr-0.5'>
          {mode === 'preview' ? (
            <Preview
              metadata={metadata}
              parameters={parameters}
              runPrompt={() => setMode('chat')}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
            />
          ) : (
            <Chat
              document={document}
              parameters={parameters}
              clearChat={() => setMode('preview')}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
            />
          )}
        </div>
      }
    />
  )
}
