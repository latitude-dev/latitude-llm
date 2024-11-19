import { ReactNode } from 'react'

import { NotFoundError } from '@latitude-data/core/lib/errors'
import buildMetatags from '$/app/_lib/buildMetatags'
import { findProjectCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import type { ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

export async function generateMetadata(
  {
    params,
  }: {
    params: Promise<{ projectId: string }>
  },
  parent: ResolvingMetadata,
) {
  const { projectId } = await params

  try {
    const session = await getCurrentUser()
    const project = await findProjectCached({
      projectId: Number(projectId),
      workspaceId: session.workspace.id,
    })

    return buildMetatags({
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
