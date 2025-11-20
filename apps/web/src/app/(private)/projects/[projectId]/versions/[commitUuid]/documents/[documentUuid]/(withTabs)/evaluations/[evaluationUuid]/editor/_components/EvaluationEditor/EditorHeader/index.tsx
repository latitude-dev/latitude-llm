import { memo, ReactNode } from 'react'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { PromptConfiguration } from '$/components/PromptConfiguration'
import { PromptIntegrations } from './PromptIntegrations'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'

export type IProviderByName = Record<string, ProviderApiKey>

export const EvaluationEditorHeader = memo(
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
    canUseSubagents?: boolean
    documentVersion?: DocumentVersion
  }) => {
    const metadataConfig = metadata?.config
    const isAgent = metadataConfig?.type === 'agent' || false

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
                    This prompt is an agent
                  </Tooltip>
                ) : null}
                <Text.H4M>{title}</Text.H4M>
              </div>
            ) : (
              title
            )}
            {leftActions}
          </div>
          <div className='flex flex-row items-start gap-2'>{rightActions}</div>
        </div>
        <div className='min-w-0 flex flex-row justify-between gap-2'>
          <ProviderModelSelector
            prompt={prompt}
            onChangePrompt={onChangePrompt}
            providers={providers}
            disabledMetadataSelectors={disabledMetadataSelectors}
            updatePromptMetadata={updatePromptMetadata}
          />
          <div className='relative flex flex-row justify-end gap-2 min-w-0'>
            {/* Badge counter needs to be on top of other buttons. For that the z-index */}
            <div className='z-10'>
              <PromptIntegrations
                disabled={disabledMetadataSelectors}
                prompt={prompt}
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
