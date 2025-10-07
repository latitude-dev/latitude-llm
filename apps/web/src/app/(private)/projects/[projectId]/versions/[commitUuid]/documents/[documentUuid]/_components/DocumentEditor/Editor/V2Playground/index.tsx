import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import Chat from './Chat'
import PreviewPrompt from './PreviewPrompt'
import { memo } from 'react'

export const V2Playground = memo(function V2Playground({
  mode,
  metadata,
  parameters,
  playground,
}: {
  metadata: ResolvedMetadata | undefined
  mode: 'preview' | 'chat'
  parameters: Record<string, unknown> | undefined
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  return mode === 'preview' ? (
    <PreviewPrompt
      showHeader
      metadata={metadata}
      parameters={parameters}
      expandParameters={expandParameters}
      setExpandParameters={setExpandParameters}
    />
  ) : (
    <Chat
      showHeader
      playground={playground}
      parameters={parameters}
      expandParameters={expandParameters}
      setExpandParameters={setExpandParameters}
    />
  )
})
