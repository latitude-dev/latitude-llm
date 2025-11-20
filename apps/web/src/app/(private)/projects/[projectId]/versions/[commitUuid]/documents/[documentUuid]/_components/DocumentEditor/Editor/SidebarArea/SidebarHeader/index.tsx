import { useCallback, useMemo, useRef } from 'react'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { type ResolvedMetadata } from '$/workers/readMetadata'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { FancySwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { useDevMode } from '$/hooks/useDevMode'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { PromptConfiguration } from '$/components/PromptConfiguration'
import { useUpdateDocumentContent } from '../hooks/usePromptConfigInSidebar'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'

export function SidebarHeader({
  metadata,
}: {
  metadata?: ResolvedMetadata | undefined
}) {
  const updateController = useRef<AbortController | null>(null)
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const isMerged = commit.mergedAt !== null
  const { updateDocumentContent } = useDocumentValue()
  const updateContent = useUpdateDocumentContent()
  const { data: providers } = useProviderApiKeys()
  const { devMode, setDevMode, isLoading: isLoadingDevMode } = useDevMode()
  const name = useMemo(
    () => document.path.split('/').pop() ?? document.path,
    [document.path],
  )
  const prompt = document.content
  const setConfig = useCallback(
    (config: Record<string, unknown>) => {
      if (updateController.current) {
        updateController.current.abort()
      }
      updateController.current = new AbortController()
      updateContent({
        prompt,
        updates: config,
        abortSignal: updateController.current.signal,
      })
    },
    [prompt, updateContent],
  )

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='w-full flex flex-row items-center justify-between gap-x-4 pt-px'>
        <div className='flex flex-row items-center gap-2 min-w-0'>
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
        updatePromptMetadata={updatePromptMetadata}
      />
    </div>
  )
}
