'use client'

import { TabSelector } from '$/components/TabSelector'
import { useSelectedPath } from '$/hooks/useSelectedPath'
import { DocumentRoutes } from '$/services/routes'
import { MAIN_NAV_LINKS } from '../_lib/constants'

export function AppTabs() {
  const selected = useSelectedPath()
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
