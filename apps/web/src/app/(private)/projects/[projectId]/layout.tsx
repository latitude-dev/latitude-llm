import { ReactNode } from 'react'

import { NotFoundError } from '@latitude-data/core/lib/errors'
import buildMetatags from '$/app/_lib/buildMetatags'
import { findProjectCached } from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
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
  // Wait for parent metadata to resolve to ensure auth middleware is executed
  const parentMetadata = await parent

  const { projectId } = await params

  try {
    const session = await getCurrentUserOrRedirect()
    const project = await findProjectCached({
      projectId: Number(projectId),
      workspaceId: session.workspace.id,
    })

    return buildMetatags({
      title: project.name,
      parent: parentMetadata,
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
