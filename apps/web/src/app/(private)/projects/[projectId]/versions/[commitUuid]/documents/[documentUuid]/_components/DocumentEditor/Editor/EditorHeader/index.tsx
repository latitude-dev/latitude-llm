import { memo } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { DocumentVersion, ProviderApiKey } from '@latitude-data/core/browser'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { PromptConfiguration } from '../PromptConfiguration'
import { updatePromptMetadata } from '$/lib/promptMetadata'
import { FancySwitchToggle } from '@latitude-data/web-ui/atoms/Switch'

export const EditorHeader = memo(
  ({
    providers,
    document,
    metadata,
    title,
    prompt,
    isMerged,
    isLatitudeProvider,
    freeRunsCount,
    onChangePrompt,
    devMode,
    setDevMode,
  }: {
    providers: ProviderApiKey[]
    document: DocumentVersion
    metadata: ResolvedMetadata | undefined
    title: string
    prompt: string
    isMerged: boolean
    isLatitudeProvider: boolean
    onChangePrompt: (prompt: string) => void
    freeRunsCount: number | undefined
    devMode: boolean
    setDevMode: ReactStateDispatch<boolean>
  }) => {
    const metadataConfig = metadata?.config
    const isAgent = metadataConfig?.type === 'agent' || false
    return (
      <div className='flex flex-col gap-y-3'>
        <div className='flex flex-row items-center justify-between gap-x-4'>
          <div className='flex flex-row items-center gap-2 min-w-0'>
            <div className='flex flex-row items-center gap-x-2'>
              {isAgent ? (
                <Tooltip trigger={<Icon name='bot' color='foregroundMuted' />}>
                  This is an agent
                </Tooltip>
              ) : null}
              <Text.H4M>{title}</Text.H4M>
              <ClickToCopyUuid
                tooltipContent='Click to copy the prompt UUID'
                uuid={document.documentUuid}
              />
            </div>
          </div>

          <div className='flex flex-row gap-x-2'>
            <ProviderModelSelector
              alignPopover='end'
              prompt={prompt}
              onChangePrompt={onChangePrompt}
              providers={providers}
              disabledMetadataSelectors={isMerged}
            />
            <PromptConfiguration
              disabled={isMerged}
              canUseSubagents={false} // This is shown in other place
              config={metadataConfig ?? {}}
              setConfig={(config: Record<string, unknown>) => {
                onChangePrompt(updatePromptMetadata(prompt, config))
              }}
            />
            <FancySwitchToggle
              iconProps={{
                name: 'terminal',
                color: devMode ? 'white' : 'foregroundMuted',
              }}
              defaultChecked={devMode}
              checked={devMode}
              onCheckedChange={setDevMode}
              buttonProps={{
                variant: devMode ? 'default' : 'outline',
              }}
            />
          </div>
        </div>

        <FreeRunsBanner
          isLatitudeProvider={isLatitudeProvider}
          freeRunsCount={freeRunsCount}
        />
      </div>
    )
  },
)
