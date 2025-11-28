import { ReactNode, useCallback, useState } from 'react'
import Link from 'next/link'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { cn } from '@latitude-data/web-ui/utils'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  MINIMUM_MONTLY_ANNOTATIONS,
  WHAT_ARE_ANNOTATIONS_VIDEO_ID,
} from '@latitude-data/constants/issues'
import { useAnnotationProgress } from './useAnnotationProgress'
import { AnnotationsProgressIcon } from './AnntationsProgressIcon'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { AnnotationExplanation } from './AnntationsProgressIcon/AnnotationExplanation'
import { useToggleModal } from '$/hooks/useToogleModal'
import { YoutubeVideoModal } from '@latitude-data/web-ui/molecules/YoutubeVideoModal'

function ThumbsUpDownIcon() {
  return (
    <div className='flex items-start'>
      <div className='z-10 flex items-center justify-center bg-success-muted rounded-xl h-10 w-10 -rotate-[15deg] mt-1'>
        <Icon name='thumbsUp' color='successMutedForeground' />
      </div>

      <div className='-ml-3 mt-1 flex items-center justify-center bg-destructive-muted rounded-xl h-10 w-10 rotate-[15deg]'>
        <Icon name='thumbsDown' color='destructiveMutedForeground' />
      </div>
    </div>
  )
}

function CurrentIndicator({
  tooltipMinimal,
  isCompleted,
}: {
  tooltipMinimal: string
  isCompleted: boolean
}) {
  return (
    <Tooltip trigger={<AnnotationsProgressIcon isCompleted={isCompleted} />}>
      {tooltipMinimal}
    </Tooltip>
  )
}

function OptimalIndicator({
  isOptimal,
  optimalAnnotations,
}: {
  isOptimal: boolean
  optimalAnnotations: number
}) {
  return (
    <Tooltip
      trigger={
        <div className='rounded-full border-4 border-background'>
          <div
            className={cn(
              'flex items-center justify-center',
              'h-6 w-6 rounded-full',
              {
                'bg-secondary': !isOptimal,
                'bg-success': isOptimal,
              },
            )}
          >
            <Icon
              name='checkClean'
              size='normal'
              color={isOptimal ? 'successForeground' : 'foregroundMuted'}
            />
          </div>
        </div>
      }
    >
      ✅ Optimal goal: {optimalAnnotations} annotations. This helps Latitude
      discover more issues in your prompts
    </Tooltip>
  )
}

function ProgressBar({
  tooltipMinimal,
  optimalAnnotations,
  currentPosition,
  minimumPosition,
  isCompleted,
  optimalAchieved,
  showCurrentIndicator,
}: {
  tooltipMinimal: string
  optimalAnnotations: number
  optimalAchieved: boolean
  isCompleted: boolean
  currentPosition: number
  minimumPosition: number
  showCurrentIndicator: boolean
}) {
  return (
    <div className='relative flex flex-col items-center w-full'>
      {/* === Indicators above the bar === */}
      <div className='z-10 absolute top-0 left-0 w-full'>
        {showCurrentIndicator ? (
          <div
            className={cn(
              'z-10 absolute -top-3.5 -translate-x-full',
            )}
            style={{ left: `${minimumPosition}%` }}
          >
            <CurrentIndicator
              tooltipMinimal={tooltipMinimal}
              isCompleted={isCompleted}
            />
          </div>
        ) : null}

        <div className='absolute -top-3.5 right-0'>
          <OptimalIndicator
            isOptimal={optimalAchieved}
            optimalAnnotations={optimalAnnotations}
          />
        </div>
      </div>

      {/* === Bar container (moved down instead of margin inside bar) === */}
      <div className='w-full'>
        <div
          className={cn('relative w-full h-1 rounded-full', {
            'bg-success-muted': optimalAchieved,
            'bg-secondary': !optimalAchieved,
          })}
        >
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 h-1 rounded-full',
              'transition-all duration-500 ease-in-out',
              {
                'bg-success': optimalAchieved,
                'bg-primary': !optimalAchieved,
              },
            )}
            style={{ width: `${currentPosition}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function Wrapper({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <div className='w-full px-4 py-5 rounded-xl border border-border bg-card'>
      <div className='flex items-start justify-between mb-8'>{header}</div>
      {children}
    </div>
  )
}

function ProgressPanelLoading() {
  return (
    <Wrapper
      header={
        <div className='w-full flex flex-col gap-1'>
          <Skeleton height='h4' className='w-3/4 mb-2' />
          <Skeleton height='h5' className='w-full' />
        </div>
      }
    >
      <Skeleton height='h7' className='w-full' />
      <div className='flex justify-end mt-4'>
        <Skeleton height='h6' className='w-32' />
      </div>
    </Wrapper>
  )
}

export function AnnotationProgressPanel({ isReady }: { isReady: boolean }) {
  const [whatOpen, setWhatOpen] = useState(false)
  const { open, onOpen, onOpenChange } = useToggleModal()
  const onCloseWhat = useCallback(() => {
    setWhatOpen(false)
  }, [])
  const onClickMoreInfo = useCallback(() => {
    onCloseWhat()
    onOpen()
  }, [onCloseWhat, onOpen])

  const progress = useAnnotationProgress({ isReady })
  const isLoading = progress.status === 'loading'

  if (isLoading) return <ProgressPanelLoading />

  const message = progress.message
  const isCompleted = progress.status === 'accomplished'
  const optimalAchieved =
    progress.status === 'accomplished' ? progress.optimalAchieved : false
  const currentAnnotations =
    progress.data.currentAnnotations > 0
      ? progress.data.currentAnnotations
      : 0.2
  const optimalAnnotations = progress.data.optimalAnnotations
  const currentPosition = Math.min(
    (currentAnnotations / optimalAnnotations) * 100,
    100,
  )
  const minimumPosition =
    (MINIMUM_MONTLY_ANNOTATIONS / optimalAnnotations) * 100

  const limitedHeader = progress.status !== 'not_started'
  return (
    <Wrapper
      header={
        <>
          <div
            className={cn('flex flex-col gap-1 flex-1', {
              'max-w-72': limitedHeader,
            })}
          >
            <div className='flex items-center gap-4'>
              {progress.status === 'not_started' ? <ThumbsUpDownIcon /> : null}
              <div className='flex flex-col'>
                {progress.status === 'accomplished' && 'header' in progress && (
                  <Text.H4B color='foreground'>{progress.header}</Text.H4B>
                )}
                {message}
              </div>
            </div>
          </div>

          {progress.status === 'accomplished' && (
            <Link href={progress.issuesDashboardLink}>
              <Button
                variant='outline'
                fancy
                iconProps={{ name: 'chevronRight', placement: 'right' }}
              >
                Review issues
              </Button>
            </Link>
          )}
        </>
      }
    >
      <ProgressBar
        isCompleted={isCompleted}
        showCurrentIndicator={!optimalAchieved}
        tooltipMinimal={progress.tooltipMinimal}
        optimalAnnotations={progress.data.optimalAnnotations}
        optimalAchieved={optimalAchieved}
        currentPosition={currentPosition}
        minimumPosition={minimumPosition}
      />
      <div className='mt-4 flex justify-between items-center opacity-60'>
        <Popover.Root open={whatOpen} onOpenChange={setWhatOpen}>
          <Popover.Trigger>
            <Text.H6 underline>What's an annotation?</Text.H6>
          </Popover.Trigger>
          <Popover.Content>
            <AnnotationExplanation
              onClose={onCloseWhat}
              onClickMoreInfo={onClickMoreInfo}
            />
          </Popover.Content>
        </Popover.Root>
        <Text.H6 color='foregroundMuted'>
          {currentAnnotations > 1 ? currentAnnotations : ''} annotations last 30
          days
        </Text.H6>
      </div>
      {open ? (
        <YoutubeVideoModal
          open
          onOpenChange={onOpenChange}
          videoId={WHAT_ARE_ANNOTATIONS_VIDEO_ID}
          autoPlay
        />
      ) : null}
    </Wrapper>
  )
}
