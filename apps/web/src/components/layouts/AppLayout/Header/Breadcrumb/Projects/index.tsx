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
import { useProductAccess } from '$/components/Providers/SessionProvider'

export function ProjectBreadcrumbItems({ segments }: { segments: string[] }) {
  const projectId = Number(segments[0])
  const { promptManagement } = useProductAccess()
  const { data: projects, isLoading } = useProjects()
  const currentProject = useMemo(
    () => projects?.find((project) => project.id === projectId),
    [projects, projectId],
  )

  const showVersions =
    promptManagement && segments.length > 2 && segments[1] == 'versions'
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
          <div className='flex flex-row items-center gap-x-1 pr-3'>
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

      {showVersions && (
        <CommitBreadcrumbItems
          segments={segments.slice(2)}
          projectId={projectId}
        />
      )}
    </>
  )
}
