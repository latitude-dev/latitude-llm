'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Confetti } from '@latitude-data/web-ui/atoms/Confetti'
import { OnboardingLayout } from './OnboardingLayout'
import { ROUTES } from '$/services/routes'

type Props = {
  projectId: number
  commitUuid: string
  documentUuid?: string
  onComplete: () => void
  isCompleting: boolean
}

function LinkCard({
  icon,
  title,
  description,
  href,
}: {
  icon: IconName
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className='flex items-center gap-4 p-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors text-left w-full'
    >
      <div className='p-4 rounded-lg bg-primary/10'>
        <Icon name={icon} color='primary' size='medium' />
      </div>
      <div className='flex flex-col gap-1'>
        <Text.H4M color='foreground'>{title}</Text.H4M>
        <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      </div>
    </Link>
  )
}

export function Step7_NextSteps({
  projectId,
  commitUuid,
  documentUuid,
  onComplete,
  isCompleting,
}: Props) {
  const tracesRoute = useMemo(() => {
    if (documentUuid) {
      return ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid }).traces.root
    }
    return ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid }).overview.root
  }, [projectId, commitUuid, documentUuid])

  const annotationsRoute = useMemo(() => {
    return ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .annotations.root()
  }, [projectId, commitUuid])

  const issuesRoute = useMemo(() => {
    return ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid }).issues.root
  }, [projectId, commitUuid])

  return (
    <OnboardingLayout centered={false}>
      <Confetti />
      <div className='flex flex-col items-center gap-8 max-w-xl mx-auto pt-12'>
        <div className='flex flex-col items-center gap-2 text-center'>
          <div className='p-3 rounded-full bg-green-100 dark:bg-green-900 mb-2'>
            <Icon name='check' color='success' size='large' />
          </div>
          <Text.H2M color='foreground'>You&apos;re all set!</Text.H2M>
          <Text.H5 color='foregroundMuted'>
            Latitude is now capturing your AI model calls.
          </Text.H5>
        </div>

        <div className='flex flex-col gap-3 w-full'>
          <Text.H5M color='foreground'>What you can do now:</Text.H5M>

          <LinkCard
            icon='eye'
            title='See all traces your app sends'
            description='View traces of every model call from your application'
            href={tracesRoute}
          />

          <LinkCard
            icon='listCheck'
            title='Review and label responses'
            description='Annotate model outputs to build evaluation datasets'
            href={annotationsRoute}
          />

          <LinkCard
            icon='alertCircle'
            title='Find failures and edge cases'
            description='Discover patterns in problematic responses'
            href={issuesRoute}
          />
        </div>

        <Button
          variant='default'
          fancy
          onClick={onComplete}
          disabled={isCompleting}
        >
          {isCompleting ? 'Finishing...' : 'Go to dashboard'}
        </Button>
      </div>
    </OnboardingLayout>
  )
}
