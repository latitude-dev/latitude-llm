import { useMemo } from 'react'
import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { SectionLoader, SidebarSection } from './Section'
import { SidebarHeader } from './SidebarHeader'
import { TriggersSidebarSection, useDocumentTriggersData } from './Triggers'
import { ToolsSidebarSection } from './Tools'

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
  return useMemo(() => {
    const isLoading = triggersData.isLoading || !metadata
    return {
      isLoading,
      triggersData,
    }
  }, [triggersData, metadata])
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
    <div className='flex flex-col gap-y-6'>
      <SidebarHeader metadata={metadata} />
      <FreeRunsBanner
        isLatitudeProvider={isLatitudeProvider}
        freeRunsCount={freeRunsCount}
      />
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
  )
}
