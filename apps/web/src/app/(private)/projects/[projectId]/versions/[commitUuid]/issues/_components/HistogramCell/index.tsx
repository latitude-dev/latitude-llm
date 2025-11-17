'use client'
import { useMemo, useEffect, useState, useRef } from 'react'
import { format, parse } from 'date-fns'
import { useIssueHistogram } from '$/stores/issues/histograms/miniStats'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { cn } from '@latitude-data/web-ui/utils'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import {
  Tooltip,
  useTooltipTextContentColor,
} from '@latitude-data/web-ui/atoms/Tooltip'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SerializedIssue } from '$/stores/issues'
import { MINI_HISTOGRAM_STATS_DAYS } from '@latitude-data/constants/issues'

function generatePlaceholderBars() {
  const length = MINI_HISTOGRAM_STATS_DAYS / 3
  const bars = []

  // Randomly select a distribution type
  const distributionType = Math.floor(Math.random() * 4)

  for (let i = 0; i < length; i++) {
    let count = 0
    const noise = 0.8 + Math.random() * 0.4

    switch (distributionType) {
      case 0: {
        // Bell curve (center-heavy)
        const center = length / 2
        const distance = Math.abs(i - center)
        const base = Math.cos((distance / center) * Math.PI)
        count = Math.round(base * 10 * noise)
        break
      }
      case 1:
        // Ascending trend
        count = Math.round((i / length) * 15 * noise)
        break

      case 2:
        // Descending trend
        count = Math.round(((length - i) / length) * 15 * noise)
        break

      case 3:
        // Random spiky
        count = Math.round(Math.random() * 12 * noise)
        break
    }

    bars.push({ date: `placeholder-${i}`, count: Math.max(count, 1) })
  }
  return bars
}

function MiniHistogramBar({
  data,
  issue,
  isPlaceholder = false,
}: {
  data: Array<{ date: string; count: number }>
  issue: SerializedIssue
  isPlaceholder?: boolean
}) {
  const color = useTooltipTextContentColor('inverse')
  const [ratios, setRatios] = useState<number[]>(() => data.map(() => 0))
  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data],
  )

  useEffect(() => {
    requestAnimationFrame(() => {
      setRatios(data.map((d) => (maxCount > 0 ? d.count / maxCount : 0)))
    })
  }, [data, maxCount])

  return (
    <div className='grid grid-cols-[max-content_auto] grid-rows-[auto_1fr] gap-x-2 gap-y-1'>
      {/* Top-left: Dotted line */}
      <div className='flex items-center'>
        <div
          className={cn('w-full border-t border-dashed', {
            'border-muted-foreground': !issue.isEscalating,
            'border-destructive': issue.isEscalating,
            'opacity-0': isPlaceholder,
            'opacity-100 transition-opacity duration-500 ease-in':
              !isPlaceholder,
          })}
        />
      </div>

      {/* Top-right: Max count number */}
      <div
        className={cn('flex items-center', {
          'opacity-0': isPlaceholder,
          'opacity-100 transition-opacity duration-500 ease-in': !isPlaceholder,
        })}
      >
        <Text.H7 color={issue.isEscalating ? 'destructive' : 'foregroundMuted'}>
          {maxCount}
        </Text.H7>
      </div>

      {/* Bottom-left: Histogram bars */}
      <div className='relative flex items-end h-8 gap-x-0.5'>
        {data.map((item, index) => {
          const ratio = ratios[index] ?? 0
          const date = parse(item.date, 'yyyy-MM-dd', new Date())
          const hasCount = item.count > 0
          const visibleHeight = Math.max(ratio * 100, 2)

          return (
            <Tooltip
              key={`${item.date}-${index}`}
              asChild
              trigger={
                <div className='relative w-1.5 h-full flex items-end'>
                  <div
                    className={cn(
                      'w-full origin-bottom transition-all duration-500 ease-out rounded-t-[1px]',
                      {
                        'bg-muted animate-pulse': isPlaceholder,
                        // Normal histogram bars
                        'bg-input':
                          !isPlaceholder && (!hasCount || !issue.isEscalating),
                        'bg-destructive/50':
                          !isPlaceholder && issue.isEscalating && hasCount,
                      },
                    )}
                    style={{
                      height: `${visibleHeight}%`,
                    }}
                  />
                </div>
              }
            >
              {!isPlaceholder && (
                <div className='flex flex-col'>
                  <div className='flex justify-between'>
                    <Text.H6M color={color}>Issues</Text.H6M>
                    <Text.H6M color={color}>{item.count}</Text.H6M>
                  </div>
                  <Text.H6 color={color}>{format(date, 'MMMM do')}</Text.H6>
                </div>
              )}
            </Tooltip>
          )
        })}
      </div>
      <div />
    </div>
  )
}

export function HistogramCell({
  issue,
  loadingMiniStats,
}: {
  issue: SerializedIssue
  loadingMiniStats: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const placholderData = useRef(generatePlaceholderBars())
  const { data } = useIssueHistogram({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId: issue.id,
  })

  const isLoadingState = loadingMiniStats || data.length === 0
  const histogramData = isLoadingState ? placholderData.current : data

  return (
    <ClientOnly>
      <MiniHistogramBar
        data={histogramData}
        issue={issue}
        isPlaceholder={isLoadingState}
      />
    </ClientOnly>
  )
}
