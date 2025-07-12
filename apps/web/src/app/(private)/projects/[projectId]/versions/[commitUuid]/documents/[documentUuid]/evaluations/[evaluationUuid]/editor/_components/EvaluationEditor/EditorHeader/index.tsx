import { memo, ReactNode } from 'react'

import { DocumentVersion, ProviderApiKey } from '@latitude-data/core/browser'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { PromptConfiguration } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/PromptConfiguration'
import { PromptIntegrations } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/PromptIntegrations'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { ProviderModelSelector } from '$/components/ProviderModelSelector'

export type IProviderByName = Record<string, ProviderApiKey>

export const EditorHeader = memo(
  ({
    title,
    titleVerticalAlign = 'center',
    metadata,
    onChangePrompt,
    rightActions,
    leftActions,
    disabledMetadataSelectors = false,
    providers,
    freeRunsCount,
    showCopilotSetting,
    isLatitudeProvider,
    prompt,
    canUseSubagents = true,
    documentVersion,
  }: {
    title: string | ReactNode
    titleVerticalAlign?: 'top' | 'center'
    metadata: ResolvedMetadata | undefined
    prompt: string
    onChangePrompt: (prompt: string) => void
    rightActions?: ReactNode
    leftActions?: ReactNode
    isLatitudeProvider: boolean
    disabledMetadataSelectors?: boolean
    providers?: ProviderApiKey[]
    freeRunsCount?: number
    showCopilotSetting?: boolean
    canUseSubagents?: boolean
    documentVersion?: DocumentVersion
  }) => {
    const metadataConfig = metadata?.config
    const isAgent = metadataConfig?.type === 'agent' || false
    const { value: showLineNumbers, setValue: setShowLineNumbers } =
      useLocalStorage({
        key: AppLocalStorage.editorLineNumbers,
        defaultValue: true,
      })
    const { value: wrapText, setValue: setWrapText } = useLocalStorage({
      key: AppLocalStorage.editorWrapText,
      defaultValue: true,
    })
    const { value: showMinimap, setValue: setShowMinimap } = useLocalStorage({
      key: AppLocalStorage.editorMinimap,
      defaultValue: false,
    })
    const { value: showCopilot, setValue: setShowCopilot } = useLocalStorage({
      key: AppLocalStorage.editorCopilot,
      defaultValue: true,
    })
    const { value: autoClosingTags, setValue: setAutoClosingTags } =
      useLocalStorage({
        key: AppLocalStorage.editorAutoClosingTags,
        defaultValue: true,
      })

    return (
      <div className='flex flex-col gap-y-3'>
        <div
          className={cn('flex flex-row justify-between gap-x-4', {
            'items-center': titleVerticalAlign === 'center',
            'items-start': titleVerticalAlign === 'top',
          })}
        >
          <div className='flex flex-row items-center gap-2 min-w-0'>
            {typeof title === 'string' ? (
              <div className='flex flex-row items-center gap-x-2'>
                {isAgent ? (
                  <Tooltip
                    trigger={<Icon name='bot' color='foregroundMuted' />}
                  >
                    This is an agent
                  </Tooltip>
                ) : null}
                <Text.H4M>{title}</Text.H4M>
              </div>
            ) : (
              title
            )}
            {leftActions}
          </div>
          <div className='flex flex-row items-start gap-2'>
            {rightActions}
            <DropdownMenu
              triggerButtonProps={{ size: 'icon' }}
              options={[
                {
                  label: 'Show line numbers',
                  onClick: () => setShowLineNumbers(!showLineNumbers),
                  checked: showLineNumbers,
                },
                {
                  label: 'Wrap text',
                  onClick: () => setWrapText(!wrapText),
                  checked: wrapText,
                },
                {
                  label: 'Show minimap',
                  onClick: () => setShowMinimap(!showMinimap),
                  checked: showMinimap,
                },
                {
                  label: 'Auto closing tags',
                  onClick: () => setAutoClosingTags(!autoClosingTags),
                  checked: autoClosingTags,
                },
                ...(showCopilotSetting
                  ? [
                      {
                        label: 'Show Copilot',
                        onClick: () => setShowCopilot(!showCopilot),
                        checked: showCopilot,
                      },
                    ]
                  : []),
              ]}
              side='bottom'
              align='end'
            />
          </div>
        </div>
        <div className='min-w-0 flex flex-row justify-between gap-2'>
          <ProviderModelSelector
            prompt={prompt}
            onChangePrompt={onChangePrompt}
            providers={providers}
            disabledMetadataSelectors={disabledMetadataSelectors}
          />
          <div className='relative flex flex-row justify-end gap-2 min-w-0'>
            {/* Badge counter needs to be on top of other buttons. For that the z-index */}
            <div className='z-10'>
              <PromptIntegrations
                disabled={disabledMetadataSelectors}
                prompt={prompt}
                onChangePrompt={onChangePrompt}
              />
            </div>
            <PromptConfiguration
              disabled={disabledMetadataSelectors}
              canUseSubagents={canUseSubagents}
              config={metadataConfig ?? {}}
              setConfig={(config: Record<string, unknown>) => {
                onChangePrompt(updatePromptMetadata(prompt, config))
              }}
            />
          </div>
        </div>
        <FreeRunsBanner
          isLatitudeProvider={isLatitudeProvider}
          freeRunsCount={freeRunsCount}
        />
        {documentVersion?.promptlVersion === 0 && (
          <Alert
            title='Upgrade syntax'
            description='As of May 31st, 2025, Latitude will no longer support this prompt syntax. Please upgrade this prompt to the new PromptL syntax.'
            variant='warning'
          />
        )}
      </div>
    )
  },
)
