import { useMemo } from 'react'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { SectionLoader, SidebarSection } from './Section'
import { SidebarHeader } from './SidebarHeader'
import { TriggersSidebarSection, useDocumentTriggersData } from './Triggers'
import { ToolsSidebarSection } from './Tools'
import { useToolsData } from './Tools/hooks/useToolsData'

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
  const isLoadingTools = useToolsData()
  return useMemo(() => {
    const isLoading = triggersData.isLoading || !metadata || isLoadingTools
    return {
      isLoading,
      triggersData,
    }
  }, [triggersData, metadata, isLoadingTools])
}

export function DocumentEditorSidebarArea({
  freeRunsCount,
}: {
  freeRunsCount?: number
}) {
  const { metadata } = useMetadata()
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
  const data = useSidebarData({ metadata })

  return (
    <div className='w-full relative flex flex-col gap-y-6 min-h-0 '>
      <SidebarHeader metadata={metadata} />
      <FreeRunsBanner
        isLatitudeProvider={isLatitudeProvider}
        freeRunsCount={freeRunsCount}
      />
      <div className='flex flex-col gap-y-6 min-w-0 custom-scrollbar scrollable-indicator'>
        {data.isLoading ? (
          <SidebarLoader />
        ) : (
          <>
            <TriggersSidebarSection
              triggers={data.triggersData.triggers}
              integrations={data.triggersData.integrations}
              document={data.triggersData.document}
            />
            <ToolsSidebarSection />
            <SidebarSection
              title='Sub-agents'
              actions={[{ onClick: () => {} }]}
            />
          </>
        )}
      </div>
    </div>
  )
}
