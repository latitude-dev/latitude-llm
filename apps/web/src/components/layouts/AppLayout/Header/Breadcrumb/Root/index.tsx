import { ROUTES } from '$/services/routes'
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { ProjectBreadcrumbItems } from '../Projects'
import { DatasetBreadcrumbItems } from '../Datasets'
import { BreadcrumbSelector, BreadcrumbSelectorOption } from '../Selector'
import { useMemo } from 'react'
import { WorkspaceSwitcher } from '../WorkspaceSwitcher'

export function RootBreadcrumbItems({ segments }: { segments: string[] }) {
  const options = useMemo(
    () =>
      ({
        projects: {
          label: 'Projects',
          href: ROUTES.projects.root,
        },
        datasets: {
          label: 'Datasets',
          href: ROUTES.datasets.root(),
        },
        settings: {
          label: 'Settings',
          href: ROUTES.settings.root,
        },
      }) as Record<string, BreadcrumbSelectorOption>,
    [],
  )
  // For some reason the root URL for projects is "dashboard" instead of "projects"
  const rootSegment = segments[0] === 'dashboard' ? 'projects' : segments[0]
  const selectedOption = rootSegment ? options[rootSegment] : undefined

  return (
    <>
      <WorkspaceSwitcher />
      <BreadcrumbSeparator />
      <BreadcrumbItem noShrink>
        <BreadcrumbSelector
          label={selectedOption?.label ?? 'Select'}
          options={Object.values(options)}
        />
      </BreadcrumbItem>
      {segments.length > 1 && rootSegment === 'projects' && (
        <ProjectBreadcrumbItems segments={segments.slice(1)} />
      )}
      {segments.length > 1 && rootSegment === 'datasets' && (
        <DatasetBreadcrumbItems segments={segments.slice(1)} />
      )}
    </>
  )
}
