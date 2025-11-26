'use client'
import { Avatar } from '@latitude-data/web-ui/atoms/Avatar'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TripleThemeToggle } from '@latitude-data/web-ui/molecules/TrippleThemeToggle'
import { useMaybeSession } from '$/components/Providers/MaybeSessionProvider'
import { AppHeaderWrapper } from '$/components/layouts/AppLayout/Header'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'

import { Container } from '../Container'
import { ForkButton } from '../ForkButton'
import { ReactNode } from 'react'
import { getUserInfoFromSession } from '$/lib/getUserInfo'

export function PromptHeader({
  shared,
  beforeShareInfo,
  showShare = true,
}: {
  shared: PublishedDocument
  showShare?: boolean
  beforeShareInfo?: ReactNode
}) {
  const { currentUser } = useMaybeSession()
  const info = currentUser ? getUserInfoFromSession(currentUser) : null
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
            <div className='flex flex-row gap-x-4'>
              {info ? (
                <div className='hidden sm:flex flex-row items-center gap-x-2'>
                  <Text.H6M>{info.name}</Text.H6M>
                  <Avatar
                    alt={info.name}
                    fallback={info.fallback}
                    className='w-6 h-6'
                  />
                </div>
              ) : null}
              <div className='min-w-20'>
                <TripleThemeToggle />
              </div>
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
