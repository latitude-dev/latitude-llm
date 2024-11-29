'use client'

import { Project, ProjectStats } from '@latitude-data/core/browser'
import useProjectStats from '$/stores/projectStats'

import { StatsPanels } from './StatsPanels'

export default function Overview({
  project,
  stats: serverStats,
}: {
  project: Project
  stats: ProjectStats
}) {
  const { data: stats, isLoading } = useProjectStats(
    {
      projectId: project.id,
    },
    {
      fallbackData: serverStats,
    },
  )

  return <StatsPanels stats={stats} isLoading={isLoading} />
}
