import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useExpandParametersOrEvaluations } from '$/hooks/playgrounds/useExpandParametersOrEvaluations'
import { ResolvedMetadata } from '$/workers/readMetadata'
import Chat from './Chat'
import PreviewPrompt from './PreviewPrompt'

export function V2Playground({
  metadata,
  mode,
  parameters,
  playground,
}: {
  metadata: ResolvedMetadata | undefined
  mode: 'preview' | 'chat'
  parameters: Record<string, unknown> | undefined
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  const expander = useExpandParametersOrEvaluations({
    initialExpanded: 'parameters',
  })

  return mode === 'preview' ? (
    <PreviewPrompt
      showHeader
      metadata={metadata}
      parameters={parameters}
      expandParameters={expander.parametersExpanded}
      setExpandParameters={expander.onToggle('parameters')}
    />
  ) : (
    <Chat
      showHeader
      playground={playground}
      parameters={parameters}
      expandParameters={expander.parametersExpanded}
      setExpandParameters={expander.onToggle('parameters')}
    />
  )
}
