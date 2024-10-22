import { useMemo } from 'react'

import {
  BreadcrumbItem,
  BreadcrumbItemSkeleton,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useProjects from '$/stores/projects'

import { BreadcrumbSelector, BreadcrumbSelectorOption } from '../Selector'
import { CommitBreadcrumbItems } from './Versions'

export function ProjectBreadcrumbItems({ segments }: { segments: string[] }) {
  const projectId = Number(segments[0])

  const { data: projects, isLoading } = useProjects()
  const currentProject = useMemo(
    () => projects?.find((project) => project.id === projectId),
    [projects, projectId],
  )

  const options = useMemo<BreadcrumbSelectorOption[]>(() => {
    if (!projects) return []
    return projects.map((p) => ({
      label: p.name,
      href: ROUTES.projects.detail({ id: p.id }).root,
    }))
  }, [projects])

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        {isLoading ? (
          <BreadcrumbItemSkeleton />
        ) : (
          <BreadcrumbSelector
            label={currentProject?.name || 'Unknown'}
            options={options}
          />
        )}
      </BreadcrumbItem>

      {segments.length > 2 && segments[1] == 'versions' && (
        <CommitBreadcrumbItems
          segments={segments.slice(2)}
          projectId={projectId}
        />
      )}
    </>
  )
}
