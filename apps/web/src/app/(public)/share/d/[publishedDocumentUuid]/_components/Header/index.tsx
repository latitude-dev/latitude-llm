'use client'

import { PublishedDocument } from '@latitude-data/core/browser'
import { Icon, Text, TripleThemeToggle } from '@latitude-data/web-ui'
import { AppHeaderWrapper } from '$/components/layouts/AppLayout/Header'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { Container } from '../Container'
import { ForkButton } from '../ForkButton'
import { ReactNode } from 'react'

export function PromptHeader({
  shared,
  beforeShareInfo,
  showShare = true,
}: {
  shared: PublishedDocument
  showShare?: boolean
  beforeShareInfo?: ReactNode
}) {
  return (
    <>
      <AppHeaderWrapper xPadding='none'>
        <Container>
          <div className='w-full flex flex-row items-center justify-between'>
            <Link
              href={ROUTES.dashboard.root}
              className='flex flex-row items-center gap-x-2'
            >
              <Icon name='logo' size='large' />
              <div className='hidden sm:flex flex-col'>
                <Text.H6M>AI tools</Text.H6M>
                <Text.H7 color='foregroundMuted'>by Latitude</Text.H7>
              </div>
            </Link>
            {showShare && <ForkButton shared={shared} />}
            <div className='min-w-20'>
              <TripleThemeToggle />
            </div>
          </div>
        </Container>
      </AppHeaderWrapper>

      {beforeShareInfo}

      <Container className='flex flex-col gap-y-8'>
        <div className='w-full flex flex-row justify-center'>
          <div className='flex flex-col gap-y-1 sm:w-modal'>
            <Text.H3 asChild>
              <h1>{shared.title}</h1>
            </Text.H3>
            <Text.H4 asChild color='foregroundMuted'>
              <p>
                {shared.description ?? 'No description for this prompt. Sad'}
              </p>
            </Text.H4>
          </div>
        </div>
      </Container>
    </>
  )
}
