import { useMemo } from 'react'

import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { BreadcrumbItemSkeleton } from '@latitude-data/web-ui/molecules/Breadcrumb'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
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
          <div className='flex flex-row items-center gap-x-1'>
            <BreadcrumbSelector
              label={currentProject?.name || 'Unknown'}
              options={options}
            />
            {currentProject && (
              <ClickToCopy
                tooltipContent='Click to copy the project ID'
                copyValue={String(currentProject.id)}
              />
            )}
          </div>
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
