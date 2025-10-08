import { FreeRunsBanner } from '$/components/FreeRunsBanner'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { SidebarSection } from './Section'
import { SidebarHeader } from './SidebarHeader'
import { TriggersSidebarSection } from './Triggers'

export function DocumentEditorSidebarArea({
  freeRunsCount,
}: {
  freeRunsCount?: number
}) {
  const { metadata } = useMetadata()
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
  return (
    <div className='flex flex-col gap-y-6'>
      <SidebarHeader metadata={metadata} />
      <FreeRunsBanner
        isLatitudeProvider={isLatitudeProvider}
        freeRunsCount={freeRunsCount}
      />
      <TriggersSidebarSection />
      <SidebarSection title='Tools' actions={[{ onClick: () => {} }]} />
      <SidebarSection title='Sub-agents' actions={[{ onClick: () => {} }]} />
    </div>
  )
}
