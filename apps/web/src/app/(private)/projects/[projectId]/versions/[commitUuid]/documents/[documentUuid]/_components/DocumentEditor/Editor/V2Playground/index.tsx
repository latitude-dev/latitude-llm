import { memo } from 'react'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import PromptPlaygroundChat from '$/components/PlaygroundCommon/PromptPlaygroundChat'
import PreviewPrompt from './PreviewPrompt'

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
  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })

  return mode === 'preview' ? (
    <PreviewPrompt
      showHeader
      metadata={metadata}
      parameters={parameters}
      debugMode={debugMode}
      setDebugMode={setDebugMode}
    />
  ) : (
    <PromptPlaygroundChat
      showHeader
      playground={playground}
      parameters={parameters}
      debugMode={debugMode}
      setDebugMode={setDebugMode}
    />
  )
})
