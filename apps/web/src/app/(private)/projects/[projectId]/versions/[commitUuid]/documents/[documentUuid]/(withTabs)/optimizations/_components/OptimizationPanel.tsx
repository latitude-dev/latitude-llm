'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { DetailsPanel } from '$/components/DetailsPanel'
import { MetadataItem, MetadataItemTooltip } from '$/components/MetadataItem'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { OptimizationWithDetails } from '@latitude-data/core/schema/types'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { format } from 'date-fns'
import Link from 'next/link'
import { forwardRef, ReactNode, RefObject, useRef, useState } from 'react'
import { ExperimentBadge } from './OptimizationsTable/ExperimentBadge'
import { VersionBadge } from './OptimizationsTable/VersionBadge'

const DETAILS_OFFSET = { top: 12, bottom: 12 }

function getPhaseDurations(optimization: OptimizationWithDetails) {
  const phases: { label: string; duration: number | null }[] = []

  if (optimization.preparedAt && optimization.createdAt) {
    phases.push({
      label: 'Preparation',
      duration:
        new Date(optimization.preparedAt).getTime() -
        new Date(optimization.createdAt).getTime(),
    })
  }

  if (optimization.executedAt && optimization.preparedAt) {
    phases.push({
      label: 'Optimization',
      duration:
        new Date(optimization.executedAt).getTime() -
        new Date(optimization.preparedAt).getTime(),
    })
  }

  if (optimization.validatedAt && optimization.executedAt) {
    phases.push({
      label: 'Validation',
      duration:
        new Date(optimization.validatedAt).getTime() -
        new Date(optimization.executedAt).getTime(),
    })
  }

  return phases
}

function EvaluationLink({
  evaluation,
  commitUuid,
}: {
  evaluation: EvaluationV2
  commitUuid: string
}) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const href = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: document.documentUuid })
    .evaluations.detail({ uuid: evaluation.uuid }).root

  return (
    <Link href={href} target='_blank'>
      <Badge variant='outlineMuted'>
        <div className='flex flex-row gap-1 items-center'>
          <Text.H6 color='foreground'>{evaluation.name}</Text.H6>
          <Icon name='externalLink' size='small' className='shrink-0' />
        </div>
      </Badge>
    </Link>
  )
}

function DatasetLink({ dataset }: { dataset: Dataset }) {
  const href = ROUTES.datasets.detail(dataset.id)

  return (
    <Link href={href} target='_blank'>
      <Badge variant='outlineMuted'>
        <div className='flex flex-row gap-1 items-center'>
          <Text.H6 color='foreground'>{dataset.name}</Text.H6>
          <Icon name='externalLink' size='small' className='shrink-0' />
        </div>
      </Badge>
    </Link>
  )
}

export const OptimizationPanelContent = forwardRef<
  HTMLDivElement,
  { optimization: OptimizationWithDetails }
>(function OptimizationPanelContent({ optimization }, ref) {
  const { commit } = useCurrentCommit()
  const [isConfigExpanded, setIsConfigExpanded] = useState(false)

  if (!optimization.finishedAt) {
    return (
      <div
        ref={ref}
        className='flex flex-col gap-4 p-4 bg-background border rounded-lg'
      >
        <Alert
          variant='warning'
          showIcon={false}
          title='This optimization is still in progress...'
        />
      </div>
    )
  }

  const totalDuration =
    new Date(optimization.finishedAt).getTime() -
    new Date(optimization.createdAt).getTime()

  const phaseDurations = getPhaseDurations(optimization)

  return (
    <DetailsPanel ref={ref} bordered>
      <DetailsPanel.Body space='none'>
        <div className='flex flex-col gap-4 p-4'>
          <MetadataItem label='Optimization id'>
            <ClickToCopy copyValue={optimization.uuid}>
              <Text.H5 align='right' color='foregroundMuted'>
                {optimization.uuid.split('-')[0]}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          <MetadataItem
            label='Timestamp'
            value={format(new Date(optimization.createdAt), 'PPp')}
          />
          <MetadataItemTooltip
            label='Duration'
            trigger={
              <Text.H5 align='right' color='foregroundMuted'>
                {formatDuration(totalDuration)}
              </Text.H5>
            }
            tooltipContent={
              <div className='flex flex-col gap-1'>
                {phaseDurations.map((phase) => (
                  <div
                    key={phase.label}
                    className='flex flex-row justify-between gap-4'
                  >
                    <Text.H6 color='background'>{phase.label}</Text.H6>
                    <Text.H6B color='background'>
                      {formatDuration(phase.duration)}
                    </Text.H6B>
                  </div>
                ))}
              </div>
            }
          />
          {!!optimization.error && (
            <Alert
              variant='destructive'
              showIcon={false}
              title='Optimization failed'
              description={optimization.error}
            />
          )}
          {!!optimization.evaluation && (
            <MetadataItem label='Evaluation'>
              <EvaluationLink
                evaluation={optimization.evaluation}
                commitUuid={optimization.baselineCommit?.uuid ?? commit.uuid}
              />
            </MetadataItem>
          )}
          {!!optimization.trainset && (
            <MetadataItem label='Trainset'>
              <DatasetLink dataset={optimization.trainset} />
            </MetadataItem>
          )}
          {!!optimization.testset && (
            <MetadataItem label='Testset'>
              <DatasetLink dataset={optimization.testset} />
            </MetadataItem>
          )}
          {(!!optimization.baselineCommit ||
            !!optimization.baselineExperiment) && (
            <MetadataItem label='Baseline'>
              <div className='flex flex-row flex-wrap gap-2 items-center'>
                {!!optimization.baselineCommit && (
                  <VersionBadge commit={optimization.baselineCommit} />
                )}
                {!!optimization.baselineExperiment?.finishedAt && (
                  <ExperimentBadge
                    experiment={optimization.baselineExperiment}
                    baselineExperimentUuid={
                      optimization.baselineExperiment?.uuid
                    }
                    optimizedExperimentUuid={
                      optimization.optimizedExperiment?.uuid
                    }
                  />
                )}
              </div>
            </MetadataItem>
          )}
          {(!!optimization.optimizedCommit ||
            !!optimization.optimizedExperiment) && (
            <MetadataItem label='Optimized'>
              <div className='flex flex-row flex-wrap gap-2 items-center'>
                {!!optimization.optimizedCommit && (
                  <VersionBadge commit={optimization.optimizedCommit} />
                )}
                {!!optimization.optimizedExperiment?.finishedAt && (
                  <ExperimentBadge
                    experiment={optimization.optimizedExperiment}
                    baselineExperimentUuid={
                      optimization.baselineExperiment?.uuid
                    }
                    optimizedExperimentUuid={
                      optimization.optimizedExperiment?.uuid
                    }
                  />
                )}
              </div>
            </MetadataItem>
          )}
          <CollapsibleBox
            title='Configuration'
            icon='settings'
            isExpanded={isConfigExpanded}
            onToggle={setIsConfigExpanded}
            scrollable={false}
            expandedContent={
              <div className='w-full flex flex-col gap-y-4'>
                {Object.entries({
                  engine: optimization.engine,
                  ...optimization.configuration,
                }).map(([key, value], index) => (
                  <div
                    key={index}
                    className='w-full flex flex-col items-start gap-y-1.5'
                  >
                    <span className='w-full flex truncate'>
                      <Text.H6B noWrap ellipsis>
                        {key}
                      </Text.H6B>
                    </span>
                    <div className='w-full min-w-0 flex flex-grow'>
                      <TextArea
                        value={
                          typeof value === 'string'
                            ? value
                            : JSON.stringify(value, null, 2)
                        }
                        minRows={1}
                        maxRows={6}
                        disabled={true}
                      />
                    </div>
                  </div>
                ))}
              </div>
            }
          />
        </div>
      </DetailsPanel.Body>
    </DetailsPanel>
  )
})

export function OptimizationPanelWrapper({
  children,
  panelContainerRef,
  tableRef,
}: {
  children: (renderProps: {
    ref: RefObject<HTMLDivElement | null>
  }) => ReactNode
  panelContainerRef: RefObject<HTMLDivElement | null>
  tableRef: RefObject<HTMLTableElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollableArea = usePanelDomRef({ selfRef: ref.current })
  const beacon = tableRef?.current

  useStickyNested({
    scrollableArea,
    beacon,
    target: ref.current,
    targetContainer: panelContainerRef?.current,
    offset: DETAILS_OFFSET,
  })

  return (
    <div ref={panelContainerRef} className='h-full'>
      {children({ ref })}
    </div>
  )
}
