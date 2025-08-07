'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { useSelectedPath } from '$/hooks/useSelectedPath'
import { DocumentRoutes } from '$/services/routes'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import { MAIN_NAV_LINKS } from '../_lib/constants'

export function AppTabs() {
  const router = useNavigate()
  const selected = useSelectedPath()
  return (
    <div className='flex flex-row'>
      <TabSelector
        showSelectedOnSubroutes
        options={MAIN_NAV_LINKS}
        selected={`/${selected}` as DocumentRoutes}
        onSelect={(value) => {
          router.push(value)
        }}
      />
    </div>
  )
}
