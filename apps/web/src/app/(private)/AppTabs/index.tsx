'use client'

import { TabSelector } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { useSelectedPath } from '$/hooks/useSelectedPath'
import { DocumentRoutes } from '$/services/routes'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'
import { ROUTES } from '$/services/routes'
import { MAIN_NAV_LINKS } from '../_lib/constants'
import { useMemo } from 'react'

export function AppTabs() {
  const router = useNavigate()
  const selected = useSelectedPath()
  const { data: hasNewDatasets, isLoading } = useFeatureFlag()
  const links = useMemo(() => {
    if (isLoading || !hasNewDatasets) return MAIN_NAV_LINKS

    return [
      ...MAIN_NAV_LINKS,
      {
        label: 'datasets (NEW)',
        value: ROUTES.datasetsV2.root(),
      },
    ]
  }, [hasNewDatasets, isLoading])
  return (
    <div className='flex flex-row'>
      <TabSelector
        showSelectedOnSubroutes
        options={links}
        selected={`/${selected}` as DocumentRoutes}
        onSelect={(value) => {
          router.push(value)
        }}
      />
    </div>
  )
}
