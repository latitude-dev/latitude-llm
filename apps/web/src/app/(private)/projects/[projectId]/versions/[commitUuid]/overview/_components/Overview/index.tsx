'use client'

import { Project } from '@latitude-data/core/browser'
import useProjectStats from '$/stores/projectStats'

import { StatsPanels } from './StatsPanels'

export default function Overview({ project }: { project: Project }) {
  const { data: stats, isLoading } = useProjectStats({
    projectId: project.id,
  })

  return <StatsPanels stats={stats} isLoading={isLoading} />
}
