'use client'

import { TabSelector } from '$/components/TabSelector'
import { useSelectedPath } from '$/hooks/useSelectedPath'
import { DocumentRoutes } from '$/services/routes'
import { useSession } from '$/components/Providers/SessionProvider'
import { MAIN_NAV_LINKS } from '../_lib/constants'

export function AppTabs() {
  const selected = useSelectedPath()
  const { membership } = useSession()

  if (membership.role === 'annotator') return null

  return (
    <div className='flex flex-row'>
      <TabSelector
        showSelectedOnSubroutes
        options={MAIN_NAV_LINKS}
        selected={`/${selected}` as DocumentRoutes}
      />
    </div>
  )
}
