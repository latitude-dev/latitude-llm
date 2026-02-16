import { useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { useProductAccess } from '$/components/Providers/SessionProvider'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { SectionLoader } from './Section'
import { SidebarHeader } from './SidebarHeader'
import { TriggersSidebarSection, useDocumentTriggersData } from './Triggers'
import { ToolsSidebarSection } from './Tools'
import { SubAgentsSidebarSection } from './SubAgents'
import { usePromptConfigData } from './hooks/usePromptConfigData'
import { useSidebarStore } from './hooks/useSidebarStore'
import { cn } from '@latitude-data/web-ui/utils'

function SidebarLoader() {
  return (
    <div className='flex flex-col gap-y-6'>
      <SectionLoader items={3} />
      <SectionLoader items={6} />
      <SectionLoader items={4} />
    </div>
  )
}

function useSidebarData({
  metadata,
}: {
  metadata: ResolvedMetadata | undefined
}) {
  const triggersData = useDocumentTriggersData()
  const isLoadingPromptConfig = usePromptConfigData()
  return useMemo(() => {
    const isLoading =
      triggersData.isLoading || !metadata || isLoadingPromptConfig
    return {
      isLoading,
      triggersData,
    }
  }, [triggersData, metadata, isLoadingPromptConfig])
}

export function DocumentEditorSidebarArea({
  freeRunsCount,
}: {
  freeRunsCount?: number
}) {
  const { documentUuid } = useParams() as { documentUuid: string }
  const reset = useSidebarStore((state) => state.reset)
  const { metadata } = useMetadata()
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
  const { agentBuilder } = useProductAccess()
  const data = useSidebarData({ metadata })

  useEffect(() => {
    return () => {
      reset()
    }
  }, [documentUuid, reset])

  return (
    <div className='w-full relative flex flex-col gap-y-6'>
      <SidebarHeader metadata={metadata} />
      <FreeRunsBanner
        isLatitudeProvider={isLatitudeProvider}
        freeRunsCount={freeRunsCount}
      />
      <div
        className={cn('flex flex-col gap-y-6 min-w-0', {
          'custom-scrollbar scrollable-indicator': agentBuilder,
        })}
      >
        {data.isLoading ? (
          <SidebarLoader />
        ) : (
          <>
            {agentBuilder && (
              <TriggersSidebarSection
                triggers={data.triggersData.triggers}
                integrations={data.triggersData.integrations}
                document={data.triggersData.document}
              />
            )}
            <ToolsSidebarSection agentBuilder={agentBuilder} />
            {agentBuilder && <SubAgentsSidebarSection />}
          </>
        )}
      </div>
    </div>
  )
}
