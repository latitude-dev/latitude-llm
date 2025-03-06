import { ROUTES } from '$/services/routes'
import { BreadcrumbItem, BreadcrumbSeparator } from '@latitude-data/web-ui'
import { ProjectBreadcrumbItems } from '../Projects'
import { BreadcrumbSelector, BreadcrumbSelectorOption } from '../Selector'

export function RootBreadcrumbItems({ segments }: { segments: string[] }) {
  const options = {
    projects: {
      label: 'Projects',
      href: ROUTES.projects.root,
    },
    datasets: {
      label: 'Datasets',
      href: ROUTES.datasets.root,
    },
    traces: {
      label: 'Traces',
      href: ROUTES.traces.root,
    },
    settings: {
      label: 'Settings',
      href: ROUTES.settings.root,
    },
  } as Record<string, BreadcrumbSelectorOption>

  const rootSegment = segments[0] === 'dashboard' ? 'projects' : segments[0] // For some reason the root URL for projects is "dashboard" instead of "projects"
  const selectedOption = rootSegment ? options[rootSegment] : undefined

  if (!selectedOption) return null

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem noShrink>
        <BreadcrumbSelector
          label={selectedOption.label}
          options={Object.values(options)}
        />
      </BreadcrumbItem>
      {segments.length > 1 && rootSegment === 'projects' && (
        <ProjectBreadcrumbItems segments={segments.slice(1)} />
      )}
    </>
  )
}
