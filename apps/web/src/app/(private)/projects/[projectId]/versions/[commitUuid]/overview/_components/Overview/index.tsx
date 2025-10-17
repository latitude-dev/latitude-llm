'use client'

import useProjectStats from '$/stores/projectStats'
import { useMemo } from 'react'
import { StatsPanels } from './StatsPanels'
import {
  ProjectLimitedView,
  Project,
} from '@latitude-data/core/schema/models/types/Project'
export default function Overview({
  project,
  limitedView,
}: {
  project: Project
  limitedView?: ProjectLimitedView
}) {
  const { data: statsNormal, isLoading } = useProjectStats({
    projectId: project.id,
    disable: !!limitedView,
  })

  const stats = useMemo(() => {
    if (limitedView) return limitedView
    return statsNormal
  }, [limitedView, statsNormal])

  return <StatsPanels stats={stats} isLoading={isLoading} />
}
