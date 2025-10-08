import { useCallback, useMemo } from 'react'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { type ResolvedMetadata } from '$/workers/readMetadata'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { FancySwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { useDevMode } from '$/hooks/useDevMode'

// FIXME: Move inside here when editor sidebar is ready
import { PromptConfiguration } from '../../PromptConfiguration'

export function SidebarHeader({
  metadata,
}: {
  metadata?: ResolvedMetadata | undefined
}) {
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const isMerged = commit.mergedAt !== null
  const { updateDocumentContent } = useDocumentValue()
  const { data: providers } = useProviderApiKeys()
  const { devMode, setDevMode, isLoading: isLoadingDevMode } = useDevMode()
  const name = useMemo(
    () => document.path.split('/').pop() ?? document.path,
    [document.path],
  )
  const prompt = document.content
  const isAgent = metadata?.config?.type === 'agent'
  const setConfig = useCallback(
    (config: Record<string, unknown>) => {
      updateDocumentContent(prompt, config)
    },
    [prompt, updateDocumentContent],
  )

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='w-full flex flex-row items-center justify-between gap-x-4 pt-px'>
        <div className='flex flex-row items-center gap-2 min-w-0'>
          {isAgent ? (
            <Tooltip trigger={<Icon name='bot' color='foregroundMuted' />}>
              This prompt is an agent
            </Tooltip>
          ) : null}
          <Text.H4M ellipsis noWrap>
            {name}
          </Text.H4M>
        </div>

        <div className='flex flex-row gap-x-2'>
          <PromptConfiguration
            showBehaviorSettings={false}
            disabled={isMerged}
            canUseSubagents={false} // This is shown in other place
            config={metadata?.config ?? {}}
            setConfig={setConfig}
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
                    loading={isLoadingDevMode}
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
      <ProviderModelSelector
        fancyButton
        alignPopover='end'
        prompt={document.content}
        onChangePrompt={updateDocumentContent}
        providers={providers}
        disabledMetadataSelectors={isMerged}
      />
    </div>
  )
}
