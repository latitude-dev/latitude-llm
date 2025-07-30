import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { FancySwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Config } from 'promptl-ai'
import { PromptConfiguration } from '../../PromptConfiguration'
import { EditorHeaderProps } from '../index'

export function TitleRow({
  providers,
  title,
  isAgent,
  isMerged,
  onChangePrompt,
  metadataConfig,
  prompt,
  devMode,
  setDevMode,
}: {
  isAgent: boolean
  prompt: EditorHeaderProps['prompt']
  metadataConfig: Config | undefined
  title: EditorHeaderProps['title']
  providers: EditorHeaderProps['providers']
  onChangePrompt: EditorHeaderProps['onChangePrompt']
  isMerged: EditorHeaderProps['isMerged']
  devMode: EditorHeaderProps['devMode']
  setDevMode: EditorHeaderProps['setDevMode']
}) {
  return (
    <div className='flex flex-row items-center justify-between gap-x-4 pt-px'>
      <div className='flex flex-row items-center gap-2 min-w-0'>
        <div className='flex flex-row items-center gap-x-2 min-w-0'>
          {isAgent ? (
            <Tooltip trigger={<Icon name='bot' color='foregroundMuted' />}>
              This prompt is an agent
            </Tooltip>
          ) : null}
          <Text.H4M ellipsis noWrap>
            {title}
          </Text.H4M>
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
          showBehaviorSettings={false}
          disabled={isMerged}
          canUseSubagents={false} // This is shown in other place
          config={metadataConfig ?? {}}
          setConfig={(config: Record<string, unknown>) => {
            onChangePrompt(updatePromptMetadata(prompt, config))
          }}
        />
        <ClientOnly loader={<Skeleton className='w-20 h-8 rounded-md' />}>
          <Tooltip
            asChild
            trigger={
              <span>
                <FancySwitchToggle
                  iconProps={{
                    name: 'terminal',
                    color: devMode ? 'white' : 'foregroundMuted',
                  }}
                  checked={devMode}
                  onCheckedChange={setDevMode}
                  buttonProps={{
                    variant: devMode ? 'default' : 'outline',
                  }}
                />
              </span>
            }
            align='center'
            side='top'
            className='cursor-pointer'
          >
            {devMode ? 'Switch to Simple Mode' : 'Switch to Dev Mode'}
          </Tooltip>
        </ClientOnly>
      </div>
    </div>
  )
}
