import { memo } from 'react'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { ProviderApiKey } from '@latitude-data/core/browser'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { TitleRow } from './TitleRow'
import { AgentToolbar } from './AgentToolbar'

export type EditorHeaderProps = {
  providers: ProviderApiKey[]
  metadata: ResolvedMetadata | undefined
  title: string
  prompt: string
  isMerged: boolean
  isLatitudeProvider: boolean
  onChangePrompt: (prompt: string) => Promise<void>
  freeRunsCount: number | undefined
  devMode: boolean
  setDevMode: ReactStateDispatch<boolean>
}

export const EditorHeader = memo(
  ({
    providers,
    metadata,
    title,
    prompt,
    isMerged,
    isLatitudeProvider,
    freeRunsCount,
    onChangePrompt,
    devMode,
    setDevMode,
  }: EditorHeaderProps) => {
    const metadataConfig = metadata?.config
    const isAgent = metadataConfig?.type === 'agent' || false
    return (
      <div className='flex flex-col gap-y-4'>
        <TitleRow
          providers={providers}
          title={title}
          isAgent={isAgent}
          isMerged={isMerged}
          devMode={devMode}
          metadataConfig={metadataConfig}
          prompt={prompt}
          onChangePrompt={onChangePrompt}
          setDevMode={setDevMode}
        />
        <AgentToolbar
          isMerged={isMerged}
          isAgent={isAgent}
          config={metadataConfig}
          prompt={prompt}
          onChangePrompt={onChangePrompt}
        />
        <FreeRunsBanner
          isLatitudeProvider={isLatitudeProvider}
          freeRunsCount={freeRunsCount}
        />
      </div>
    )
  },
)
