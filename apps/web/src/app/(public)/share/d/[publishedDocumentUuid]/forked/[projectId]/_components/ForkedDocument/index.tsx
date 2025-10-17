'use client'
import { PromptHeader } from '$/app/(public)/share/d/[publishedDocumentUuid]/_components/Header'
import { Container } from '$/app/(public)/share/d/[publishedDocumentUuid]/_components/Container'
import { Card, CardContent } from '@latitude-data/web-ui/atoms/Card'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  CardDescription,
  CardTitle,
  CardHeader,
} from '@latitude-data/web-ui/atoms/Card'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'
export function ForkedDocument({
  shared,
  project,
  commit,
  document,
}: {
  document: DocumentVersion
  commit: Commit
  project: Project
  shared: PublishedDocument
}) {
  const url = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).root
  return (
    <div className='h-screen bg-background-gray flex flex-col pb-4 sm:pb-8 gap-y-4 sm:gap-y-8 custom-scrollbar'>
      <PromptHeader
        shared={shared}
        showShare={false}
        beforeShareInfo={
          <Container className='flex justify-center'>
            <Card shadow='sm' background='light' className='w-modal'>
              <CardHeader>
                <CardTitle>Prompt copied!</CardTitle>
                <CardDescription>The prompt now is yours.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='flex flex-col gap-y-4'>
                  <Text.H5>You can see it here:</Text.H5>
                  <Link href={url}>
                    <Button
                      fancy
                      variant='default'
                      iconProps={{ name: 'externalLink' }}
                    >
                      View copied project
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </Container>
        }
      />
    </div>
  )
}
