import { ReactNode } from 'react'

import { NotFoundError } from '@latitude-data/core/lib/errors'
import { findProjectCached } from '$/app/(private)/_data-access'
import { useMetatags } from '$/hooks/useMetatags'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import type { ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

export async function generateMetadata(
  {
    params,
  }: {
    params: { projectId: string }
  },
  parent: ResolvingMetadata,
) {
  try {
    const session = await getCurrentUser()
    const project = await findProjectCached({
      projectId: Number(params.projectId),
      workspaceId: session.workspace.id,
    })

    return useMetatags({
      title: project.name,
      parent: await parent,
    })
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()
    throw error
  }
}

export default async function ProjectLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}
