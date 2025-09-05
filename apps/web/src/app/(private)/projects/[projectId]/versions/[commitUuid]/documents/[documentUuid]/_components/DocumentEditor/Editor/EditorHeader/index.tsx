import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { memo } from 'react'
import { AgentToolbar } from './AgentToolbar'
import { TitleRow } from './TitleRow'

export type EditorHeaderProps = {
  freeRunsCount: number | undefined
  isLatitudeProvider: boolean
  isMerged: boolean
  metadata: ResolvedMetadata | undefined
  onChangePrompt: (prompt: string) => void
  prompt: string
  title: string
}

export const EditorHeader = memo(
  ({
    metadata,
    title,
    prompt,
    isMerged,
    isLatitudeProvider,
    freeRunsCount,
    onChangePrompt,
  }: EditorHeaderProps) => {
    const metadataConfig = metadata?.config
    const isAgent = metadataConfig?.type === 'agent' || false

    return (
      <div className='flex flex-col gap-y-4'>
        <TitleRow
          title={title}
          isAgent={isAgent}
          isMerged={isMerged}
          metadataConfig={metadataConfig}
          prompt={prompt}
          onChangePrompt={onChangePrompt}
        />
        <FreeRunsBanner
          isLatitudeProvider={isLatitudeProvider}
          freeRunsCount={freeRunsCount}
        />
        <AgentToolbar
          isMerged={isMerged}
          isAgent={isAgent}
          config={metadataConfig}
          prompt={prompt}
          onChangePrompt={onChangePrompt}
        />
      </div>
    )
  },
)
