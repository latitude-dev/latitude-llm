import { BreadcrumbItem, BreadcrumbSeparator } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'

import { EvaluationBreadcrumbItems } from '../Evaluations'
import { ProjectBreadcrumbItems } from '../Projects'
import { BreadcrumbSelector, BreadcrumbSelectorOption } from '../Selector'

export function RootBreadcrumbItems({ segments }: { segments: string[] }) {
  const options = {
    projects: {
      label: 'Projects',
      href: ROUTES.projects.root,
    },
    evaluations: {
      label: 'Evaluations',
      href: ROUTES.evaluations.root,
    },
    datasets: {
      label: 'Datasets',
      href: ROUTES.datasets.root,
    },
    // TODO: telemetry - uncomment when we release telemetry
    // traces: {
    // label: 'Traces',
    // href: ROUTES.traces.root,
    // },
    settings: {
      label: 'Settings',
      href: ROUTES.settings.root,
    },
  } as Record<string, BreadcrumbSelectorOption>

  const rootSegment = segments[0] === 'dashboard' ? 'projects' : segments[0] // For some reason the root URL for projects is "dashboard" instead of "projects"
  const selectedOption = rootSegment ? options[rootSegment] : undefined

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem noShrink>
        <BreadcrumbSelector
          label={selectedOption?.label || 'Unknown'}
          options={Object.values(options)}
        />
      </BreadcrumbItem>

      {segments.length > 1 && rootSegment === 'projects' && (
        <ProjectBreadcrumbItems segments={segments.slice(1)} />
      )}
      {segments.length > 2 && rootSegment === 'evaluations' && (
        <EvaluationBreadcrumbItems segments={segments.slice(2)} />
      )}
    </>
  )
}
