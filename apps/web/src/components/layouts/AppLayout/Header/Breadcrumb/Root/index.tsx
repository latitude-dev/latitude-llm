import { ROUTES } from '$/services/routes'
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { ProjectBreadcrumbItems } from '../Projects'
import { DatasetBreadcrumbItems, DatasetV1BreadcrumbItems } from '../Datasets'
import { BreadcrumbSelector, BreadcrumbSelectorOption } from '../Selector'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

export function RootBreadcrumbItems({ segments }: { segments: string[] }) {
  const options = {
    projects: {
      label: 'Projects',
      href: ROUTES.projects.root,
    },
    datasets: {
      label: 'Datasets',
      href: ROUTES.datasets.root(),
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

  const { enabled: isV2Enabled } = useFeatureFlag({ featureFlag: 'datasetsV2' })
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
      {segments.length > 1 && rootSegment === 'datasets' && (
        <>
          {isV2Enabled ? (
            <DatasetBreadcrumbItems segments={segments.slice(1)} />
          ) : (
            <DatasetV1BreadcrumbItems segments={segments.slice(1)} />
          )}
        </>
      )}
    </>
  )
}
