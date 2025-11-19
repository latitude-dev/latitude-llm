'use client'

import useProjectStats from '$/stores/projectStats'
import { StatsPanels } from './StatsPanels'
import { Project } from '@latitude-data/core/schema/models/types/Project'
export default function Overview({ project }: { project: Project }) {
  const { data: stats, isLoading } = useProjectStats({
    projectId: project.id,
  })

  return <StatsPanels stats={stats} isLoading={isLoading} />
}
