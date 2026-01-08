'use client'

import { useMemo, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { OnboardingLayout } from './OnboardingLayout'
import { ROUTES } from '$/services/routes'

type Props = {
  projectId: number
  commitUuid: string
  documentUuid?: string
  onComplete: () => void
  isCompleting: boolean
}

const CONFETTI_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
]

type Shape = 'rectangle' | 'square' | 'circle'

type ConfettiPiece = {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  size: number
  shape: Shape
  drift: number
  wobble: number
}

function Confetti() {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([])

  useEffect(() => {
    const shapes: Shape[] = ['rectangle', 'square', 'circle']
    const confettiPieces: ConfettiPiece[] = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 3 + Math.random() * 3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
      size: 8 + Math.random() * 8,
      shape: shapes[Math.floor(Math.random() * shapes.length)]!,
      drift: (Math.random() - 0.5) * 200,
      wobble: Math.random() * 10,
    }))
    setPieces(confettiPieces)
  }, [])

  const getShapeStyles = (piece: ConfettiPiece): React.CSSProperties => {
    const base: React.CSSProperties = {
      backgroundColor: piece.color,
      width: piece.size,
    }

    switch (piece.shape) {
      case 'circle':
        return { ...base, height: piece.size, borderRadius: '50%' }
      case 'square':
        return { ...base, height: piece.size, borderRadius: '2px' }
      case 'rectangle':
      default:
        return { ...base, height: piece.size * 0.4, borderRadius: '2px' }
    }
  }

  return (
    <div className='fixed inset-x-0 top-0 h-screen pointer-events-none overflow-hidden z-50'>
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className='absolute'
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            ...getShapeStyles(piece),
            animation: `confetti-fall ${piece.duration}s ease-out ${piece.delay}s forwards`,
            ['--drift' as string]: `${piece.drift}px`,
            ['--rotation' as string]: `${360 + Math.random() * 720}deg`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(var(--drift)) rotate(var(--rotation));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
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
      className='flex items-start gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left w-full'
    >
      <div className='p-2 rounded-lg bg-primary/10'>
        <Icon name={icon} color='primary' />
      </div>
      <div className='flex flex-col gap-1'>
        <Text.H5M color='foreground'>{title}</Text.H5M>
        <Text.H6 color='foregroundMuted'>{description}</Text.H6>
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
        .documents.detail({ uuid: documentUuid })
        .traces.root
    }
    return ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .overview.root
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
      .commits.detail({ uuid: commitUuid })
      .issues.root
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
            description='View traces of every model call from your application.'
            href={tracesRoute}
          />

          <LinkCard
            icon='listCheck'
            title='Review and label responses'
            description='Annotate model outputs to build evaluation datasets.'
            href={annotationsRoute}
          />

          <LinkCard
            icon='alertCircle'
            title='Find failures and edge cases'
            description='Discover patterns in problematic responses.'
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

