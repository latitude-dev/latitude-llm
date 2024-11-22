'use server'

import { ReactNode } from 'react'

import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'

import DocumentsLayout from '../../(commit)/_components/DocumentsLayout'
import CommitLayout from '../../(commit)/layout'

export type CommitPageParams = {
  children: ReactNode
  params: Promise<
    Awaited<ProjectPageParams['params']> & {
      commitUuid: string
      documentUuid?: string
    }
  >
}

export default async function TracesLayout({
  children,
  params,
}: CommitPageParams) {
  const { projectId, commitUuid } = await params

  return (
    <CommitLayout params={params}>
      <DocumentsLayout projectId={Number(projectId)} commitUuid={commitUuid}>
        {children}
      </DocumentsLayout>
    </CommitLayout>
  )
}
