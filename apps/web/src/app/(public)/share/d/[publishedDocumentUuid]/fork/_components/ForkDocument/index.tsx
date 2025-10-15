'use client'
import { PromptHeader } from '$/app/(public)/share/d/[publishedDocumentUuid]/_components/Header'
import { Container } from '$/app/(public)/share/d/[publishedDocumentUuid]/_components/Container'
import { Card, CardContent } from '@latitude-data/web-ui/atoms/Card'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  CardDescription,
  CardTitle,
  CardHeader,
} from '@latitude-data/web-ui/atoms/Card'
import { ForkButton } from '$/app/(public)/share/d/[publishedDocumentUuid]/_components/ForkButton'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'

export function ForkDocument({ shared }: { shared: PublishedDocument }) {
  const back = ROUTES.share.document(shared.uuid!).root
  return (
    <div className='h-screen bg-background-gray flex flex-col pb-4 sm:pb-8 gap-y-4 sm:gap-y-8 custom-scrollbar'>
      <PromptHeader
        shared={shared}
        beforeShareInfo={
          <Container className='flex justify-center'>
            <Card shadow='sm' background='light' className='w-modal'>
              <CardHeader>
                <CardTitle>Copy this prompt</CardTitle>
                <CardDescription>
                  This prompt will be copied to your Latitude account
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-row gap-x-4'>
                <Button variant='outline' fullWidth asChild>
                  <Link
                    href={back}
                    className='flex flex-row items-center gap-x-2'
                  >
                    <Icon name='chevronLeft' />
                    <span>Back to Prompt</span>
                  </Link>
                </Button>
                <ForkButton fullWidth variant='default' shared={shared} />
              </CardContent>
            </Card>
          </Container>
        }
      />
    </div>
  )
}
